import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Errand, { type IErrand } from '../models/errand.model.js'
import User from '../models/user.model.js'
import { WalletTransaction, WALLET_TX_TYPE } from '../models/wallet.model.js'
import { CbcService } from './cbc.service.js'
import { NotificationService } from './notification.service.js'
import {
    ERRAND_STATUS,
    BID_STATUS,
    NOTIFICATION_TYPE,
    REFERRAL_REWARD_INDIVIDUAL,
    REFERRAL_REWARD_CORPORATE,
    USER_ROLE,
    SUBSCRIPTION_STATUS,
} from '../utils/constant.js'
import {
    getCbcContactFee,
    applyPlanDiscount,
    resolveCommissionRate,
    calculateCommission,
    calculateSellerEarnings,
} from '../utils/fee.js'
import {
    NotFoundError,
    ForbiddenError,
    ConflictError,
    ValidationError,
} from '../utils/appError.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import { uploadToCloudinary } from '../middlewares/upload.js'
import {
    generateReference,
    initializeTransaction,
    initiateRefund,
} from '../utils/paystack.js'
import { SkillService } from './skill.service.js'
import EarningsClearance, { CLEARANCE_SOURCE } from '../models/earnin.js'
import { emailQueue } from '../utils/queue.js'
import Subscription from '../models/subscription.model.js'
import planModel from '../models/plan.model.js'
import { emitToUser } from '../utils/socketHelper.js'

interface PostErrandDto {
    title: string
    description: string
    category: string
    budgetType: 'fixed' | 'negotiable'
    budget: number
    address: string
    deadline: Date
}

interface BrowseErrandsOptions extends PaginationOptions {
    category?: string
    status?: string
    maxBudget?: number
}

const cbcService = new CbcService()
const skillService = new SkillService()
const notificationService = new NotificationService()

export class ErrandService extends BaseService {
    // ── Post errand + debit CBC ───────────────────────────────────────────────
    async postErrand(userId: string, dto: PostErrandDto): Promise<IErrand> {
        const [user, sub, freePlan] = await Promise.all([
            User.findById(userId)
                .select('isStudent isStudentVerified subscriptionTier role')
                .lean(),
            Subscription.findOne({
                userId: new mongoose.Types.ObjectId(userId),
                status: SUBSCRIPTION_STATUS.ACTIVE,
                expiresAt: { $gt: new Date() },
            })
                .select('planSnapshot.cbcDiscount')
                .lean(),
            planModel.findOne({ tier: 'free' }).select('cbcDiscount').lean(),
        ])

        if (!user) throw new NotFoundError('User')

        const baseFee = getCbcContactFee(
            dto.budget,
            user.isStudentVerified ?? false,
        )
        const discount = Number(
            sub?.planSnapshot?.cbcDiscount ?? freePlan?.cbcDiscount ?? 0,
        )
        const fee = applyPlanDiscount(baseFee, discount)
        // Debit CBC before creating errand — throws if insufficient
        await cbcService.debit(
            userId,
            fee,
            WALLET_TX_TYPE.DEBIT_ERRAND_POST,
            `CBC fee for posting errand: ${dto.title}`,
            undefined,
            { errandTitle: dto.title },
        )

        await notificationService.create({
            userId,
            type: NOTIFICATION_TYPE.CBC_CREDIT,
            title: 'CBC fee deducted',
            body: `${fee} CBC coins were deducted for posting "${dto.title}".`,
            data: { fee, errandTitle: dto.title },
        })

        const errand = await Errand.create({
            posterId: userId,
            title: dto.title,
            description: dto.description,
            category: dto.category,
            budgetType: dto.budgetType,
            budget: dto.budget,
            address: dto.address,
            deadline: dto.deadline,
            cbcFeeCharged: fee,
        })

        // ── Auto-match runners in background — non-blocking, never throws ─────
        skillService
            .matchRunnersForErrand(errand._id.toString(), 10)
            .then(async (matches: any) => {
                if (matches.length === 0) return

                await Promise.all(
                    matches.map((match: any) =>
                        notificationService
                            .create({
                                userId: match.user._id.toString(),
                                type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                                title: 'New errand matches your skills',
                                body: `"${errand.title}" in ${errand.category} might be a good fit for you.`,
                                data: {
                                    errandId: errand._id.toString(),
                                    matchScore: match.matchScore,
                                    category: errand.category,
                                    budget: errand.budget,
                                },
                            })
                            .catch(() => null),
                    ),
                )
            })
            .catch(() => null)

        return errand
    }

    // ── Browse open errands ───────────────────────────────────────────────────
    async browseErrands(opts: BrowseErrandsOptions) {
        const filter: Record<string, unknown> = {
            status: ERRAND_STATUS.POSTED,
            deadline: { $gt: new Date() },
        }

        if (opts.category) filter.category = opts.category
        if (opts.status) filter.status = opts.status
        if (opts.maxBudget !== undefined) {
            filter.budget = { $lte: opts.maxBudget }
        }

        const page = opts.page ?? 1
        const limit = Math.min(opts.limit ?? 20, 50)
        const skip = (page - 1) * limit

        const [data, total] = await Promise.all([
            Errand.aggregate([
                { $match: filter },

                {
                    $lookup: {
                        from: 'users',
                        localField: 'posterId',
                        foreignField: '_id',
                        as: 'poster',
                    },
                },
                { $unwind: '$poster' },

                {
                    $addFields: {
                        posterSubscriptionWeight: {
                            $cond: [
                                { $eq: ['$poster.subscriptionTier', 'elite'] },
                                3,
                                {
                                    $cond: [
                                        {
                                            $eq: [
                                                '$poster.subscriptionTier',
                                                'pro',
                                            ],
                                        },
                                        2,
                                        {
                                            $cond: [
                                                {
                                                    $eq: [
                                                        '$poster.subscriptionTier',
                                                        'basic',
                                                    ],
                                                },
                                                1,
                                                0,
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },

                { $sort: { posterSubscriptionWeight: -1, createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },

                {
                    $project: {
                        title: 1,
                        description: 1,
                        category: 1,
                        budget: 1,
                        status: 1,
                        deadline: 1,
                        createdAt: 1,

                        poster: {
                            _id: '$poster._id',
                            firstName: '$poster.firstName',
                            lastName: '$poster.lastName',
                            displayName: '$poster.displayName',
                            avatar: '$poster.avatar',
                            averageRating: '$poster.averageRating',
                            identityVerificationBadge:
                                '$poster.identityVerificationBadge',
                            slug: '$poster.slug',
                        },

                        posterSubscriptionWeight: 1,
                    },
                },
            ]),

            Errand.countDocuments(filter),
        ])

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1,
            },
        }
    }

    // ── My posted errands ─────────────────────────────────────────────────────
    async myPostedErrands(userId: string, opts: PaginationOptions) {
        return paginate(
            Errand,
            {
                posterId: new mongoose.Types.ObjectId(userId),
                status: { $ne: ERRAND_STATUS.CANCELLED },
            },
            opts,
            '-completionProofPublicId',
        )
    }
    // ── My running errands ────────────────────────────────────────────────────
    async myRunningErrands(userId: string, opts: PaginationOptions) {
        return paginate(
            Errand,
            {
                runnerId: new mongoose.Types.ObjectId(userId),
                status: ERRAND_STATUS.IN_PROGRESS,
            },
            opts,
            '-completionProofPublicId',
        )
    }
    // ── My in-progress errands (both poster and runner see this) ──────────────
    async myInProgressErrands(userId: string, opts: PaginationOptions) {
        const uid = new mongoose.Types.ObjectId(userId)
        return paginate(
            Errand,
            {
                status: ERRAND_STATUS.IN_PROGRESS,
                $or: [{ posterId: uid }, { runnerId: uid }],
            },
            opts,
            '-completionProofPublicId',
        )
    }
    // ── My accepted errands as poster ─────────────────────────────────────────
    async myAcceptedErrands(userId: string, opts: PaginationOptions) {
        return paginate(
            Errand,
            {
                posterId: new mongoose.Types.ObjectId(userId),
                status: ERRAND_STATUS.ACCEPTED,
            },
            opts,
            '-completionProofPublicId',
        )
    }
    // ── My accepted bids as runner ────────────────────────────────────────────
    async myAcceptedBids(userId: string, opts: PaginationOptions) {
        const uid = new mongoose.Types.ObjectId(userId)
        const page = Math.max(1, opts.page ?? 1)
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20))
        const skip = (page - 1) * limit

        const [results, totalArr] = await Promise.all([
            Errand.aggregate([
                {
                    $match: {
                        'bids.runnerId': uid,
                        'bids.status': BID_STATUS.ACCEPTED,
                    },
                },
                { $unwind: '$bids' },
                {
                    $match: {
                        'bids.runnerId': uid,
                        'bids.status': BID_STATUS.ACCEPTED,
                    },
                },
                { $sort: { 'bids.createdAt': -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        category: 1,
                        status: 1,
                        budget: 1,
                        address: 1,
                        deadline: 1,
                        escrowConfirmed: 1,
                        escrowReference: 1,
                        agreedAmount: 1,
                        sellerEarningsNGN: 1,
                        bid: {
                            _id: '$bids._id',
                            amount: '$bids.amount',
                            message: '$bids.message',
                            status: '$bids.status',
                            createdAt: '$bids.createdAt',
                        },
                    },
                },
            ]),
            Errand.aggregate([
                {
                    $match: {
                        'bids.runnerId': uid,
                        'bids.status': BID_STATUS.ACCEPTED,
                    },
                },
                { $unwind: '$bids' },
                {
                    $match: {
                        'bids.runnerId': uid,
                        'bids.status': BID_STATUS.ACCEPTED,
                    },
                },
                { $count: 'total' },
            ]),
        ])

        const total = totalArr[0]?.total ?? 0
        const totalPages = Math.ceil(total / limit)

        return {
            data: results,
            meta: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        }
    }
    async myBids(userId: string, opts: PaginationOptions) {
        const uid = new mongoose.Types.ObjectId(userId)
        const page = Math.max(1, opts.page ?? 1)
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20))
        const skip = (page - 1) * limit

        const [results, totalArr] = await Promise.all([
            Errand.aggregate([
                { $match: { 'bids.runnerId': uid } },
                { $unwind: '$bids' },
                { $match: { 'bids.runnerId': uid } },
                { $sort: { 'bids.createdAt': -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        category: 1,
                        status: 1,
                        budget: 1,
                        address: 1,
                        deadline: 1,
                        bid: {
                            _id: '$bids._id',
                            amount: '$bids.amount',
                            message: '$bids.message',
                            status: '$bids.status',
                            createdAt: '$bids.createdAt',
                        },
                    },
                },
            ]),
            Errand.aggregate([
                { $match: { 'bids.runnerId': uid } },
                { $unwind: '$bids' },
                { $match: { 'bids.runnerId': uid } },
                { $count: 'total' },
            ]),
        ])

        const total = totalArr[0]?.total ?? 0
        const totalPages = Math.ceil(total / limit)

        return {
            data: results,
            meta: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        }
    }
    // ── Get single errand ─────────────────────────────────────────────────────
    async getErrand(errandId: string, currentUserId?: string) {
        const errand = await Errand.findById(errandId)
            .populate(
                'posterId',
                'firstName lastName displayName avatar averageRating isStudent identityVerificationBadge slug',
            )
            .populate(
                'runnerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
            )
            .populate(
                'bids.runnerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
            )
            .lean()

        if (!errand) throw new NotFoundError('Errand')

        const isPoster =
            currentUserId &&
            (errand.posterId as any)?._id?.toString() === currentUserId

        const bids = errand.bids ?? []

        const isBidder =
            currentUserId &&
            bids.some(
                (bid: any) => bid.runnerId?._id?.toString() === currentUserId,
            )

        const activeBids = bids.filter(
            (b: any) => b.status === BID_STATUS.PENDING,
        )
        const bidAmounts = activeBids.map((b: any) => b.amount)

        const bidStats =
            bidAmounts.length > 0
                ? {
                      count: bidAmounts.length,
                      min: Math.min(...bidAmounts),
                      max: Math.max(...bidAmounts),
                      avg: Math.round(
                          bidAmounts.reduce((a, b) => a + b, 0) /
                              bidAmounts.length,
                      ),
                  }
                : { count: 0 }

        const safeErrand: any = { ...errand, bids }

        if (isPoster) {
            safeErrand.bidStats = bidStats
            return safeErrand
        }

        if (isBidder) {
            safeErrand.bids = bids.filter(
                (bid: any) => bid.runnerId?._id?.toString() === currentUserId,
            )
            safeErrand.bidStats = bidStats
            return safeErrand
        }

        safeErrand.runnerId = undefined
        safeErrand.bids = []
        safeErrand.bidStats = { count: bidStats.count }

        return safeErrand
    }
    // ── Place a bid ───────────────────────────────────────────────────────────
    async placeBid(
        errandId: string,
        runnerId: string,
        amount: number,
        message?: string,
    ) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.status !== ERRAND_STATUS.POSTED) {
            throw new ConflictError('This errand is no longer accepting bids')
        }
        if (errand.posterId.toString() === runnerId) {
            throw new ForbiddenError('You cannot bid on your own errand')
        }

        const hasBid = errand.bids.some(
            (b) =>
                b.runnerId.toString() === runnerId &&
                b.status === BID_STATUS.PENDING,
        )
        if (hasBid)
            throw new ConflictError(
                'You already have an active bid on this errand',
            )

        errand.bids.push({
            _id: new mongoose.Types.ObjectId(),
            runnerId: new mongoose.Types.ObjectId(runnerId),
            amount,
            message,
            status: BID_STATUS.PENDING,
            createdAt: new Date(),
        })
        errand.bidsCount = (errand.bidsCount || 0) + 1
        await errand.save()

        await notificationService.create({
            userId: errand.posterId,
            type: NOTIFICATION_TYPE.NEW_BID,
            title: 'New bid on your errand',
            body: `Someone placed a ₦${amount.toLocaleString()} bid on "${errand.title}"`,
            data: { errandId: errand._id.toString() },
        })

        return errand
    }
    async withdrawBid(errandId: string, bidId: string, runnerId: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')

        const bid = errand.bids.find((b) => b._id.toString() === bidId)
        if (!bid) throw new NotFoundError('Bid')
        if (bid.runnerId.toString() !== runnerId) {
            throw new ForbiddenError('You can only withdraw your own bid')
        }
        if (bid.status !== BID_STATUS.PENDING) {
            throw new ConflictError('Only pending bids can be withdrawn')
        }

        bid.status = BID_STATUS.WITHDRAWN
        errand.bidsCount = Math.max((errand.bidsCount || 1) - 1, 0)
        await errand.save()
        return errand
    }
    // ── Accept a bid (poster) ─────────────────────────────────────────────────
    async acceptBid(errandId: string, bidId: string, posterId: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.posterId.toString() !== posterId) {
            throw new ForbiddenError('Only the poster can accept a bid')
        }
        if (errand.status !== ERRAND_STATUS.POSTED) {
            throw new ConflictError('Errand is no longer accepting bids')
        }

        const bid = errand.bids.find((b) => b._id.toString() === bidId)
        if (!bid) throw new NotFoundError('Bid')
        if (bid.status !== BID_STATUS.PENDING) {
            throw new ConflictError('This bid is no longer available')
        }

        const runner = await User.findById(bid.runnerId)
            .select(
                'isStudent isStudentVerified subscriptionTier role firstName email',
            )
            .lean()
        if (!runner) throw new NotFoundError('Runner')

        // ── DB-driven commission via plan record ──────────────────────────────
        const plan = await planModel
            .findOne({ tier: runner.subscriptionTier, isActive: true })
            .select('commissionRate studentCommissionRate')
            .lean()
        if (!plan) throw new ValidationError('Runner plan not found')

        const isCorporateRunner = runner.role === USER_ROLE.CORPORATE
        const commissionRate = resolveCommissionRate(
            plan,
            runner.isStudentVerified ?? false,
            isCorporateRunner,
        )
        const commissionNGN = calculateCommission(bid.amount, commissionRate)
        const sellerEarnings = calculateSellerEarnings(
            bid.amount,
            commissionRate,
        )
        const escrowRef = generateReference('ERR')

        errand.bids.forEach((b) => {
            b.status =
                b._id.toString() === bidId
                    ? BID_STATUS.ACCEPTED
                    : BID_STATUS.REJECTED
        })

        errand.status = ERRAND_STATUS.ACCEPTED
        errand.runnerId = bid.runnerId
        errand.acceptedBidId = bid._id
        errand.agreedAmount = bid.amount
        errand.commissionRate = commissionRate
        errand.commissionNGN = commissionNGN
        errand.sellerEarningsNGN = sellerEarnings
        errand.escrowReference = escrowRef

        await errand.save()

        await notificationService.create({
            userId: bid.runnerId,
            type: NOTIFICATION_TYPE.ERRAND_UPDATE,
            title: 'Your bid was accepted!',
            body: `Your bid of ₦${bid.amount.toLocaleString()} on "${errand.title}" was accepted.`,
            data: {
                errandId: errand._id.toString(),
                escrowReference: escrowRef,
            },
        })

        await emailQueue.add('errand-bid-accepted', {
            runnerId: bid.runnerId.toString(),
            errandTitle: errand.title,
            errandId: errand._id.toString(),
            amount: bid.amount,
            escrowReference: escrowRef,
        })

        return { errand, escrowReference: escrowRef, amountNGN: bid.amount }
    }
    // ── Mark errand as in progress (runner) ──────────────────────────────────
    async startErrand(errandId: string, runnerId: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.runnerId?.toString() !== runnerId) {
            throw new ForbiddenError(
                'Only the assigned runner can start this errand',
            )
        }
        if (errand.status !== ERRAND_STATUS.ACCEPTED) {
            throw new ConflictError('Errand must be in accepted state to start')
        }
        if (!errand.escrowConfirmed) {
            throw new ValidationError(
                'Escrow payment must be confirmed before starting',
            )
        }

        errand.status = ERRAND_STATUS.IN_PROGRESS
        await errand.save()

        await notificationService.create({
            userId: errand.posterId,
            type: NOTIFICATION_TYPE.ERRAND_UPDATE,
            title: 'Errand started',
            body: `Your errand "${errand.title}" is now in progress.`,
            data: { errandId: errand._id.toString() },
        })

        await emailQueue.add('errand-started', {
            posterId: errand.posterId.toString(),
            errandTitle: errand.title,
            errandId: errand._id.toString(),
        })

        return errand
    }
    // ── Mark errand done + upload proof (runner) ──────────────────────────────
    async completeErrand(
        errandId: string,
        runnerId: string,
        note?: string,
        proofBuffer?: Buffer,
        proofMimetype?: string,
    ) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.runnerId?.toString() !== runnerId) {
            throw new ForbiddenError(
                'Only the assigned runner can complete this errand',
            )
        }
        if (errand.status !== ERRAND_STATUS.IN_PROGRESS) {
            throw new ConflictError(
                'Errand must be in progress to mark complete',
            )
        }

        if (proofBuffer && proofMimetype) {
            const resourceType =
                proofMimetype === 'application/pdf' ? 'raw' : 'image'
            const result = await uploadToCloudinary(
                proofBuffer,
                `campusbaze/errand-proof/${errandId}`,
                resourceType,
            )
            errand.completionProofUrl = result.secure_url
            errand.completionProofPublicId = result.public_id
        }

        errand.completionNote = note
        errand.status = ERRAND_STATUS.COMPLETED
        await errand.save()

        if (errand.sellerEarningsNGN) {
            await cbcService.holdEarnings(
                runnerId,
                errand.sellerEarningsNGN,
                WALLET_TX_TYPE.EARNING_HELD,
                `Earnings held from errand: "${errand.title}"`,
                errand._id.toString(),
            )
        }

        await notificationService.create({
            userId: errand.posterId,
            type: NOTIFICATION_TYPE.ERRAND_UPDATE,
            title: 'Errand marked as done',
            body: `"${errand.title}" has been marked complete by the runner. Please confirm.`,
            data: { errandId: errand._id.toString() },
        })

        await emailQueue.add('errand-completed', {
            posterId: errand.posterId.toString(),
            errandTitle: errand.title,
            errandId: errand._id.toString(),
        })

        return errand
    }
    // ── Poster confirms → escrow released, referral checked ──────────────────
    async confirmErrand(errandId: string, posterId: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.posterId.toString() !== posterId) {
            throw new ForbiddenError('Only the poster can confirm completion')
        }
        if (errand.status !== ERRAND_STATUS.COMPLETED) {
            throw new ConflictError(
                'Errand must be marked completed by the runner first',
            )
        }

        errand.status = ERRAND_STATUS.CONFIRMED
        await errand.save()

        if (errand.runnerId) {
            await User.findByIdAndUpdate(errand.runnerId, {
                $inc: { totalOrdersCompleted: 1 },
            })
        }

        if (errand.runnerId && errand.sellerEarningsNGN) {
            await EarningsClearance.create({
                userId: errand.runnerId,
                sourceType: CLEARANCE_SOURCE.ERRAND,
                sourceId: errand._id,
                amountNGN: errand.sellerEarningsNGN,
            })
        }

        if (errand.runnerId) {
            await this._checkAndPayReferral(errand.runnerId.toString())
        }

        await notificationService.create({
            userId: errand.runnerId!,
            type: NOTIFICATION_TYPE.PAYMENT,
            title: 'Errand confirmed — earnings pending clearance',
            body: `"${errand.title}" was confirmed. ₦${errand.sellerEarningsNGN?.toLocaleString()} is pending admin clearance before withdrawal.`,
            data: {
                errandId: errand._id.toString(),
                earningsNGN: errand.sellerEarningsNGN,
            },
        })

        await emailQueue.add('errand-confirmed', {
            runnerId: errand.runnerId?.toString(),
            errandTitle: errand.title,
            errandId: errand._id.toString(),
            earnings: errand.sellerEarningsNGN,
        })

        return errand
    }
    // ── Cancel errand (poster, before acceptance) ─────────────────────────────
    async cancelErrand(errandId: string, posterId: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')
        if (errand.posterId.toString() !== posterId) {
            throw new ForbiddenError('Only the poster can cancel this errand')
        }

        if (errand.escrowConfirmed) {
            throw new ConflictError(
                'Cannot cancel after payment is made. Please raise a dispute.',
            )
        }
        if (
            errand.status !== ERRAND_STATUS.POSTED &&
            errand.status !== ERRAND_STATUS.ACCEPTED
        ) {
            throw new ConflictError(
                'Errand cannot be cancelled in its current status',
            )
        }
        if (
            errand.status === ERRAND_STATUS.ACCEPTED &&
            errand.escrowConfirmed
        ) {
            throw new ConflictError(
                'Cannot cancel after escrow is confirmed. Please raise a dispute.',
            )
        }

        errand.status = ERRAND_STATUS.CANCELLED
        await errand.save()
        return errand
    }
    // ── Raise dispute ─────────────────────────────────────────────────────────
    async disputeErrand(errandId: string, userId: string, reason: string) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')

        const isParticipant =
            errand.posterId.toString() === userId ||
            errand.runnerId?.toString() === userId
        if (!isParticipant)
            throw new ForbiddenError('You are not a participant in this errand')

        if (
            errand.status !== ERRAND_STATUS.IN_PROGRESS &&
            errand.status !== ERRAND_STATUS.COMPLETED &&
            errand.status !== ERRAND_STATUS.ACCEPTED
        ) {
            throw new ConflictError(
                'Dispute can only be raised on in-progress or completed errands',
            )
        }

        errand.status = ERRAND_STATUS.DISPUTED
        errand.disputeReason = reason
        await errand.save()

        const otherParty =
            errand.posterId.toString() === userId
                ? errand.runnerId
                : errand.posterId

        if (otherParty) {
            await notificationService.create({
                userId: otherParty,
                type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                title: 'Dispute opened',
                body: `A dispute has been raised on errand "${errand.title}". Admin has been notified.`,
                data: { errandId: errand._id.toString() },
            })
        }

        await emailQueue.add('errand-disputed', {
            posterId: errand.posterId.toString(),
            runnerId: errand.runnerId?.toString(),
            errandTitle: errand.title,
            errandId: errand._id.toString(),
        })

        return errand
    }
    // ── Confirm escrow payment (called by webhook) ────────────────────────────
    async confirmEscrow(escrowReference: string): Promise<void> {
        const errand = await Errand.findOneAndUpdate(
            { escrowReference },
            { escrowConfirmed: true },
            { new: true }, // ← add { new: true } so you get the doc back
        )

        if (!errand) return

        // 🔌 Real-time update
        emitToUser(errand.posterId.toString(), 'errand:updated', {
            id: errand._id.toString(),
            escrowConfirmed: true,
        })
        if (errand.runnerId) {
            emitToUser(errand.runnerId.toString(), 'errand:updated', {
                id: errand._id.toString(),
                escrowConfirmed: true,
            })
        }

        // ✅ Notify runner that payment is confirmed and they can start
        if (errand.runnerId) {
            await notificationService.create({
                userId: errand.runnerId.toString(),
                type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                title: 'Payment confirmed — you can start!',
                body: `The poster has paid for "${errand.title}". Mark it as started when you begin.`,
                data: { errandId: errand._id.toString() },
            })
        }
    }
    // ── Resolve dispute (admin only) ──────────────────────────────────────────
    async resolveErrandDispute(
        errandId: string,
        adminId: string,
        outcome: 'favour_poster' | 'favour_runner',
        adminNote: string,
    ) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')

        if (errand.status !== ERRAND_STATUS.DISPUTED) {
            throw new ConflictError('Errand is not in a disputed state')
        }

        const earningsWereHeld =
            !!errand.completionNote || !!errand.completionProofUrl

        errand.disputeNote = adminNote
        errand.disputeResolvedBy = new mongoose.Types.ObjectId(adminId)

        // 🟢 RUNNER WINS
        if (outcome === 'favour_runner') {
            if (errand.runnerId && errand.sellerEarningsNGN) {
                if (earningsWereHeld) {
                    await cbcService.releaseHeldEarnings(
                        errand.runnerId.toString(),
                        errand.sellerEarningsNGN,
                        errand._id.toString(),
                    )
                } else {
                    await cbcService.creditEarnings(
                        errand.runnerId.toString(),
                        errand.sellerEarningsNGN,
                        WALLET_TX_TYPE.EARNING_RELEASED,
                        'Dispute resolved in runner favour (pre-completion)',
                        errand._id.toString(),
                    )
                }
            }

            errand.status = ERRAND_STATUS.CONFIRMED
            await errand.save()

            await Promise.all([
                notificationService.create({
                    userId: errand.posterId.toString(),
                    type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                    title: 'Dispute resolved',
                    body: `Resolved in favour of runner.`,
                    data: { errandId },
                }),
                errand.runnerId
                    ? notificationService.create({
                          userId: errand.runnerId.toString(),
                          type: NOTIFICATION_TYPE.PAYMENT,
                          title: 'Dispute resolved in your favour',
                          body: `₦${errand.sellerEarningsNGN?.toLocaleString()}`,
                          data: { errandId },
                      })
                    : Promise.resolve(),
            ])
        }

        // 🔴 POSTER WINS
        else {
            errand.status = ERRAND_STATUS.CANCELLED
            await errand.save()

            if (errand.runnerId && errand.sellerEarningsNGN) {
                if (earningsWereHeld) {
                    await cbcService.reverseHeldEarnings(
                        errand.runnerId.toString(),
                        errand.sellerEarningsNGN,
                        errand._id.toString(),
                        `Dispute resolved in favour of poster: ${adminNote}`,
                    )
                } else {
                    // 💸 NO ESCROW → PAYSTACK REFUND
                    if (errand.paymentReference) {
                        await initiateRefund(errand.paymentReference)
                    }
                }
            }

            await Promise.all([
                notificationService.create({
                    userId: errand.posterId.toString(),
                    type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                    title: 'Dispute resolved in your favour',
                    body: `Errand cancelled.`,
                    data: { errandId },
                }),
                errand.runnerId
                    ? notificationService.create({
                          userId: errand.runnerId.toString(),
                          type: NOTIFICATION_TYPE.ERRAND_UPDATE,
                          title: 'Dispute resolved',
                          body: `Resolved in favour of poster.`,
                          data: { errandId },
                      })
                    : Promise.resolve(),
            ])
        }

        return errand
    }
    // ── Initiate escrow payment ───────────────────────────────────────────────
    async initiateEscrowPayment(
        userId: string,
        errandId: string,
        email: string,
    ) {
        const errand = await Errand.findById(errandId)
        if (!errand) throw new NotFoundError('Errand')

        if (errand.posterId.toString() !== userId) {
            throw new ForbiddenError('Only poster can pay')
        }
        if (errand.escrowConfirmed) {
            throw new ConflictError('Already paid')
        }
        if (!errand.agreedAmount) {
            throw new ConflictError('Agreed amount not set')
        }
        if (!errand.escrowReference) {
            throw new ConflictError('Escrow reference not found')
        }
        if (errand.status !== ERRAND_STATUS.ACCEPTED) {
            throw new ConflictError('Errand not ready for payment')
        }

        return initializeTransaction(
            email,
            errand.agreedAmount,
            errand.escrowReference!,
            {
                userId,
                type: 'escrow',
                errandId: errand._id.toString(),
            },
        )
    }
    // ─── Private: referral reward on first transaction ────────────────────────
    private async _checkAndPayReferral(userId: string): Promise<void> {
        try {
            const user = await User.findById(userId)
                .select('referredBy role')
                .lean()
            if (!user?.referredBy) return

            const referrerId = user.referredBy.toString()

            const alreadyPaid = await WalletTransaction.exists({
                userId: new mongoose.Types.ObjectId(referrerId),
                type: WALLET_TX_TYPE.REFERRAL_REWARD,
                'metadata.refereeId': userId,
            })
            if (alreadyPaid) return

            const reward =
                user.role === USER_ROLE.CORPORATE
                    ? REFERRAL_REWARD_CORPORATE
                    : REFERRAL_REWARD_INDIVIDUAL

            await cbcService.credit(
                referrerId,
                reward,
                WALLET_TX_TYPE.REFERRAL_REWARD,
                `Referral reward — referred user ${userId} completed first transaction`,
                undefined,
                { refereeId: userId },
            )

            await notificationService.create({
                userId: referrerId,
                type: NOTIFICATION_TYPE.REFERRAL,
                title: 'Referral reward credited!',
                body: `You earned ${reward} CBC because someone you referred completed their first transaction.`,
                data: { refereeId: userId, amount: reward },
            })
        } catch {
            // Non-fatal — log but don't break the main flow
        }
    }
}
