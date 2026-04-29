import mongoose from 'mongoose'
import dayjs from 'dayjs'
import { BaseService } from './base.service.js'
import ServiceListing from '../models/services.model.js'
import Order from '../models/order.model.js'
import User from '../models/user.model.js'
import { WalletTransaction, WALLET_TX_TYPE } from '../models/wallet.model.js'
import { CbcService } from './cbc.service.js'
import { NotificationService } from './notification.service.js'
import {
    LISTING_STATUS,
    ORDER_STATUS,
    NOTIFICATION_TYPE,
    REFERRAL_REWARD_INDIVIDUAL,
    REFERRAL_REWARD_CORPORATE,
    USER_ROLE,
    type OrderStatus,
    SUBSCRIPTION_STATUS,
} from '../utils/constant.js'
import {
    resolveCommissionRate,
    calculateCommission,
    calculateSellerEarnings,
    getCbcContactFee,
    applyPlanDiscount,
} from '../utils/fee.js'
import {
    NotFoundError,
    ForbiddenError,
    ConflictError,
    ValidationError,
    BadRequestError,
} from '../utils/appError.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import {
    generateReference,
    initializeTransaction,
    initiateRefund,
} from '../utils/paystack.js'
import { emailQueue } from '../utils/queue.js'
import EarningsClearance, { CLEARANCE_SOURCE } from '../models/earnin.js'
import planModel from '../models/plan.model.js'
import { emitToUser } from '../utils/socketHelper.js'
import Subscription from '../models/subscription.model.js'

interface CreateListingDto {
    title: string
    description: string
    category: string
    tiers: Array<{
        name: 'starter' | 'standard' | 'premium'
        price: number
        deliveryDays: number
        description: string
        revisions: number
    }>
    tags?: string[]
    portfolioUrls?: string[]
}

interface BrowseListingsOptions extends PaginationOptions {
    category?: string
    status?: string
    maxPrice?: number
    q?: string
    isStudent?: boolean
}

const cbcService = new CbcService()
const notificationService = new NotificationService()

export class ServiceListingService extends BaseService {
    // ── Create listing ────────────────────────────────────────────────────────
    async createListing(sellerId: string, dto: CreateListingDto) {
        const listing = await ServiceListing.create({
            sellerId,
            title: dto.title,
            description: dto.description,
            category: dto.category,
            tiers: dto.tiers,
            tags: dto.tags ?? [],
            portfolioUrls: dto.portfolioUrls ?? [],
            status: LISTING_STATUS.DRAFT,
        })
        return listing
    }
    // ── Update listing ────────────────────────────────────────────────────────
    async updateListing(
        listingId: string,
        sellerId: string,
        updates: Partial<CreateListingDto> & { status?: string },
    ) {
        const listing = await ServiceListing.findById(listingId)
        if (!listing) throw new NotFoundError('Service listing')
        if (listing.sellerId.toString() !== sellerId) {
            throw new ForbiddenError('You can only edit your own listings')
        }

        const allowed = [
            'title',
            'description',
            'category',
            'tiers',
            'tags',
            'portfolioUrls',
            'status',
        ] as const
        for (const key of allowed) {
            if (updates[key] !== undefined) {
                ;(listing as unknown as Record<string, unknown>)[key] =
                    updates[key]
            }
        }
        await listing.save()
        return listing
    }
    // ── Delete listing (only if no active orders) ─────────────────────────────
    async deleteListing(listingId: string, sellerId: string) {
        const listing = await ServiceListing.findById(listingId)
        if (!listing) throw new NotFoundError('Service listing')
        if (listing.sellerId.toString() !== sellerId) {
            throw new ForbiddenError('You can only delete your own listings')
        }

        const activeOrders = await Order.exists({
            listingId: new mongoose.Types.ObjectId(listingId),
            status: {
                $in: [
                    ORDER_STATUS.IN_PROGRESS,
                    ORDER_STATUS.PENDING_PAYMENT,
                    ORDER_STATUS.DELIVERED,
                ],
            },
        })
        if (activeOrders)
            throw new ConflictError(
                'Cannot delete a listing with active orders',
            )

        listing.status = LISTING_STATUS.DRAFT
        await listing.save()
        return { message: 'Listing deactivated' }
    }
    // ── Browse listings ───────────────────────────────────────────────────────
    async browseListings(opts: BrowseListingsOptions) {
        const filter: Record<string, unknown> = {
            status: opts.status ?? LISTING_STATUS.ACTIVE,
        }

        if (opts.category) filter.category = opts.category

        if (opts.q) {
            const escaped = opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            filter.$text = { $search: escaped }
        }

        if (opts.maxPrice !== undefined) {
            filter['tiers.price'] = { $lte: opts.maxPrice }
        }

        const page = opts.page ?? 1
        const limit = Math.min(opts.limit ?? 20, 50)
        const skip = (page - 1) * limit

        const [data, total] = await Promise.all([
            ServiceListing.aggregate([
                { $match: filter },

                {
                    $lookup: {
                        from: 'users',
                        localField: 'sellerId',
                        foreignField: '_id',
                        as: 'seller',
                    },
                },
                { $unwind: '$seller' },

                {
                    $addFields: {
                        sellerSubscriptionWeight: {
                            $cond: [
                                { $eq: ['$seller.subscriptionTier', 'elite'] },
                                3,
                                {
                                    $cond: [
                                        {
                                            $eq: [
                                                '$seller.subscriptionTier',
                                                'pro',
                                            ],
                                        },
                                        2,
                                        {
                                            $cond: [
                                                {
                                                    $eq: [
                                                        '$seller.subscriptionTier',
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

                {
                    $sort: {
                        sellerSubscriptionWeight: -1,
                        createdAt: -1,
                    },
                },

                { $skip: skip },
                { $limit: limit },

                {
                    $project: {
                        seller: {
                            _id: '$seller._id',
                            firstName: '$seller.firstName',
                            lastName: '$seller.lastName',
                            displayName: '$seller.displayName',
                            avatar: '$seller.avatar',
                            averageRating: '$seller.averageRating',
                            isStudent: '$seller.isStudent',
                            identityVerificationBadge:
                                '$seller.identityVerificationBadge',
                            subscriptionTier: '$seller.subscriptionTier',
                            slug: '$seller.slug',
                        },
                        title: 1,
                        category: 1,
                        tiers: 1,
                        createdAt: 1,
                        sellerSubscriptionWeight: 1,
                    },
                },
            ]),

            ServiceListing.countDocuments(filter),
        ])

        const totalPages = Math.ceil(total / limit)

        return {
            data,
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
    // ── My listings ───────────────────────────────────────────────────────────
    async myListings(sellerId: string, opts: PaginationOptions) {
        return paginate(
            ServiceListing,
            { sellerId: new mongoose.Types.ObjectId(sellerId) },
            opts,
            undefined,
            [
                {
                    path: 'sellerId',
                    select: 'firstName lastName displayName avatar averageRating isStudent identityVerificationBadge subscriptionTier slug',
                },
            ],
        )
    }
    // ── Get single listing ────────────────────────────────────────────────────
    async getListing(listingId: string) {
        const listing = await ServiceListing.findById(listingId)
            .populate(
                'sellerId',
                'firstName lastName displayName avatar averageRating isStudent identityVerificationBadge subscriptionTier slug',
            )
            .lean()
        if (!listing) throw new NotFoundError('Service listing')
        return listing
    }
    // ── Place order — init Paystack ───────────────────────────────────────────
    async placeOrder(
        buyerId: string,
        buyerEmail: string,
        listingId: string,
        tierName: 'starter' | 'standard' | 'premium',
        requirements?: string,
        callbackUrl?: string,
    ) {
        const listing = await ServiceListing.findById(listingId).lean()
        if (!listing) throw new NotFoundError('Service listing')
        if (listing.status !== LISTING_STATUS.ACTIVE) {
            throw new ConflictError(
                'This listing is not currently accepting orders',
            )
        }
        if (listing.sellerId.toString() === buyerId) {
            throw new ForbiddenError('You cannot order your own service')
        }

        const tier = listing.tiers.find((t) => t.name === tierName)
        if (!tier) throw new NotFoundError('Pricing tier')

        // Commission based on SELLER's tier — not the buyer's
        const seller = await User.findById(listing.sellerId)
            .select('isStudent isStudentVerified subscriptionTier role')
            .lean()
        if (!seller) throw new NotFoundError('Seller')

        // ── Fetch buyer's subscription for CBC discount ───────────────────────
        const [buyer, buyerSub] = await Promise.all([
            User.findById(buyerId).select('isStudent isStudentVerified').lean(),
            Subscription.findOne({
                userId: new mongoose.Types.ObjectId(buyerId),
                status: SUBSCRIPTION_STATUS.ACTIVE,
                expiresAt: { $gt: new Date() },
            })
                .select('planSnapshot.cbcDiscount')
                .lean(),
        ])
        if (!buyer) throw new NotFoundError('Buyer')

        // ── Charge CBC contact fee to buyer ───────────────────────────────────
        const baseFee = getCbcContactFee(
            tier.price,
            buyer.isStudentVerified ?? false,
        )
        const discount = Number(buyerSub?.planSnapshot?.cbcDiscount ?? 0)
        const cbcFee = applyPlanDiscount(baseFee, discount)

        await cbcService.debit(
            buyerId,
            cbcFee,
            WALLET_TX_TYPE.DEBIT_CONTACT,
            `CBC fee for ordering "${listing.title}" (${tierName})`,
            undefined,
            { listingId, tierName },
        )

        // ── DB-driven commission via plan record ──────────────────────────────
        const plan = await planModel
            .findOne({ tier: seller.subscriptionTier, isActive: true })
            .select('commissionRate studentCommissionRate')
            .lean()
        if (!plan) throw new ValidationError('Seller plan not found')

        const isCorporateSeller = seller.role === USER_ROLE.CORPORATE
        const commissionRate = resolveCommissionRate(
            plan,
            seller.isStudentVerified ?? false,
            isCorporateSeller,
        )
        const commissionNGN = calculateCommission(tier.price, commissionRate)
        const sellerEarnings = calculateSellerEarnings(
            tier.price,
            commissionRate,
        )
        const deliveryDue = dayjs().add(tier.deliveryDays, 'day').toDate()
        const escrowRef = generateReference('ORD')

        const order = await Order.create({
            buyerId,
            sellerId: listing.sellerId,
            listingId,
            tierName,
            amount: tier.price,
            commissionRate,
            commissionNGN,
            sellerEarningsNGN: sellerEarnings,
            cbcFeeCharged: cbcFee,
            deliveryDue,
            requirements,
            escrowReference: escrowRef,
            status: ORDER_STATUS.PENDING_PAYMENT,
        })

        await ServiceListing.findByIdAndUpdate(listingId, {
            $inc: { impressions: 1 },
        })

        await emailQueue.add('order-created', {
            buyerEmail,
            sellerId: listing.sellerId,
            listingTitle: listing.title,
            orderId: order._id.toString(),
        })

        await notificationService.create({
            userId: listing.sellerId,
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'New order received!',
            body: `You have a new order for "${listing.title}" (${tierName}).`,
            data: { orderId: order._id.toString() },
        })

        const populatedOrder = await this._populateOrder(order._id)

        return {
            order: populatedOrder,
            escrowReference: escrowRef,
            amountNGN: tier.price,
        }
    }
    // ── Confirm escrow (webhook) ──────────────────────────────────────────────
    async confirmOrderEscrow(escrowReference: string): Promise<void> {
        const order = await Order.findOneAndUpdate(
            { escrowReference },
            { escrowConfirmed: true, status: ORDER_STATUS.IN_PROGRESS },
            { new: true },
        )

        if (!order) return

        // 🔌 Emit real-time status to both buyer and seller
        emitToUser(order.buyerId.toString(), 'order:updated', {
            id: order._id.toString(),
            status: ORDER_STATUS.IN_PROGRESS,
        })
        emitToUser(order.sellerId.toString(), 'order:updated', {
            id: order._id.toString(),
            status: ORDER_STATUS.IN_PROGRESS,
        })

        // ✅ Notify seller that payment is confirmed and work should begin
        await notificationService.create({
            userId: order.sellerId.toString(),
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'Payment confirmed — start working!',
            body: `The buyer's payment has been confirmed. Your order is now active.`,
            data: { orderId: order._id.toString() },
        })

        const [buyer, listing] = await Promise.all([
            User.findById(order.buyerId).select('email').lean(),
            ServiceListing.findById(order.listingId).select('title').lean(),
        ])

        await emailQueue.add('order-created', {
            buyerEmail: buyer?.email ?? '',
            sellerId: order.sellerId.toString(),
            listingTitle: listing?.title ?? 'your order',
            orderId: order._id.toString(),
        })
    }
    // ── Seller delivers ───────────────────────────────────────────────────────
    async deliverOrder(
        orderId: string,
        sellerId: string,
        deliveryNote?: string,
    ) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')
        if (order.sellerId.toString() !== sellerId) {
            throw new ForbiddenError(
                'Only the seller can mark this order as delivered',
            )
        }
        if (
            order.status !== ORDER_STATUS.IN_PROGRESS &&
            order.status !== ORDER_STATUS.REVISION
        ) {
            throw new ConflictError(
                'Order must be in progress or revision to deliver',
            )
        }

        order.status = ORDER_STATUS.DELIVERED
        order.deliveryNote = deliveryNote
        order.deliveredAt = new Date()
        await order.save()

        await cbcService.holdEarnings(
            order.sellerId.toString(),
            order.sellerEarningsNGN,
            WALLET_TX_TYPE.EARNING_HELD,
            `Earnings held from service order`,
            order._id.toString(),
        )

        await emailQueue.add('order-delivered', {
            buyerId: order.buyerId.toString(),
            listingTitle: (
                await ServiceListing.findById(order.listingId)
                    .select('title')
                    .lean()
            )?.title,
            orderId: order._id.toString(),
        })

        await notificationService.create({
            userId: order.buyerId,
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'Order delivered',
            body: `Your order has been delivered. Please review and confirm.`,
            data: { orderId: order._id.toString() },
        })

        return await this._populateOrder(order._id)
    }

    // ── Buyer confirms delivery ───────────────────────────────────────────────
    async confirmOrder(orderId: string, buyerId: string) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')
        if (order.buyerId.toString() !== buyerId) {
            throw new ForbiddenError('Only the buyer can confirm this order')
        }
        if (order.status === ORDER_STATUS.COMPLETED) {
            return this._populateOrder(order._id) // idempotent
        }
        if (order.status !== ORDER_STATUS.DELIVERED) {
            throw new ConflictError(
                'Order must be delivered before you can confirm',
            )
        }

        order.status = ORDER_STATUS.COMPLETED
        order.completedAt = new Date()
        await order.save()

        await emailQueue.add('order-completed', {
            sellerId: order.sellerId.toString(),
            listingTitle: (
                await ServiceListing.findById(order.listingId)
                    .select('title')
                    .lean()
            )?.title,
            orderId: order._id.toString(),
            earnings: order.sellerEarningsNGN,
        })

        await User.findByIdAndUpdate(order.sellerId, {
            $inc: { totalOrdersCompleted: 1 },
        })
        await ServiceListing.findByIdAndUpdate(order.listingId, {
            $inc: { totalOrders: 1 },
        })

        await EarningsClearance.create({
            userId: order.sellerId,
            sourceType: CLEARANCE_SOURCE.ORDER,
            sourceId: order._id,
            amountNGN: order.sellerEarningsNGN,
        })

        await this._checkAndPayReferral(order.sellerId.toString())

        await notificationService.create({
            userId: order.sellerId,
            type: NOTIFICATION_TYPE.PAYMENT,
            title: 'Order completed — earnings pending clearance',
            body: `Your order has been confirmed. ₦${order.sellerEarningsNGN.toLocaleString()} is pending admin clearance before withdrawal.`,
            data: {
                orderId: order._id.toString(),
                earningsNGN: order.sellerEarningsNGN,
            },
        })

        return await this._populateOrder(order._id)
    }
    // ── Buyer requests revision ───────────────────────────────────────────────
    async requestRevision(orderId: string, buyerId: string, note: string) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')
        if (order.buyerId.toString() !== buyerId) {
            throw new ForbiddenError('Only the buyer can request a revision')
        }
        if (order.status !== ORDER_STATUS.DELIVERED) {
            throw new ConflictError(
                'Revision can only be requested after delivery',
            )
        }

        const listing = await ServiceListing.findById(order.listingId).lean()
        const tier = listing?.tiers.find((t) => t.name === order.tierName)
        if (tier && order.revisionCount >= tier.revisions) {
            throw new ValidationError(
                `No more revisions available for the ${order.tierName} tier (${tier.revisions} included)`,
            )
        }

        order.status = ORDER_STATUS.REVISION
        order.revisionNote = note
        order.revisionCount += 1
        await order.save()

        await emailQueue.add('order-revision-requested', {
            sellerId: order.sellerId.toString(),
            listingTitle: (
                await ServiceListing.findById(order.listingId)
                    .select('title')
                    .lean()
            )?.title,
            orderId: order._id.toString(),
        })

        await notificationService.create({
            userId: order.sellerId,
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'Revision requested',
            body: `The buyer requested a revision on their order.`,
            data: { orderId: order._id.toString() },
        })

        return await this._populateOrder(order._id)
    }
    // ── Dispute order ─────────────────────────────────────────────────────────
    async disputeOrder(orderId: string, userId: string, reason: string) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')

        const isParticipant =
            order.buyerId.toString() === userId ||
            order.sellerId.toString() === userId
        if (!isParticipant)
            throw new ForbiddenError('You are not a participant in this order')

        if (
            order.status !== ORDER_STATUS.IN_PROGRESS &&
            order.status !== ORDER_STATUS.DELIVERED &&
            order.status !== ORDER_STATUS.REVISION
        ) {
            throw new ConflictError(
                'Dispute can only be raised on active orders',
            )
        }

        order.status = ORDER_STATUS.DISPUTED
        order.disputeReason = reason
        order.disputeOpenedBy = new mongoose.Types.ObjectId(userId)
        await order.save()

        const listingTitle = (
            await ServiceListing.findById(order.listingId)
                .select('title')
                .lean()
        )?.title

        await emailQueue.add('order-disputed', {
            buyerId: order.buyerId.toString(),
            sellerId: order.sellerId.toString(),
            listingTitle,
            orderId: order._id.toString(),
        })

        const otherParty =
            order.buyerId.toString() === userId ? order.sellerId : order.buyerId

        await notificationService.create({
            userId: otherParty,
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'Dispute opened',
            body: `A dispute has been raised on your order. Admin has been notified.`,
            data: { orderId: order._id.toString() },
        })

        return order
    }
    // ── Resolve order dispute (admin only) ────────────────────────────────────
    async resolveOrderDispute(
        orderId: string,
        adminId: string,
        outcome: 'favour_buyer' | 'favour_seller',
        adminNote: string,
    ) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')

        if (order.status !== ORDER_STATUS.DISPUTED) {
            throw new ConflictError('Order is not in a disputed state')
        }

        const reviewerId = new mongoose.Types.ObjectId(adminId)

        const listing = await ServiceListing.findById(order.listingId)
            .select('title')
            .lean()

        const listingTitle = listing?.title ?? 'your order'

        const earningsWereHeld = !!order.deliveredAt

        order.disputeNote = adminNote
        order.disputeResolvedBy = reviewerId

        // 🟢 SELLER WINS
        if (outcome === 'favour_seller') {
            order.status = ORDER_STATUS.COMPLETED
            await order.save()

            if (earningsWereHeld) {
                await cbcService.releaseHeldEarnings(
                    order.sellerId.toString(),
                    order.sellerEarningsNGN,
                    order._id.toString(),
                )
            } else {
                await cbcService.creditEarnings(
                    order.sellerId.toString(),
                    order.sellerEarningsNGN,
                    WALLET_TX_TYPE.EARNING_RELEASED,
                    'Dispute resolved in seller favour (pre-delivery)',
                    order._id.toString(),
                )
            }

            await Promise.all([
                notificationService.create({
                    userId: order.sellerId.toString(),
                    type: NOTIFICATION_TYPE.ORDER_UPDATE,
                    title: 'Dispute resolved in your favour',
                    body: `₦${order.sellerEarningsNGN.toLocaleString()} added.`,
                    data: { orderId },
                }),
                notificationService.create({
                    userId: order.buyerId.toString(),
                    type: NOTIFICATION_TYPE.ORDER_UPDATE,
                    title: 'Dispute resolved',
                    body: `Dispute resolved in favour of seller.`,
                    data: { orderId },
                }),
                emailQueue.add('order-dispute-resolved', {
                    buyerId: order.buyerId.toString(),
                    sellerId: order.sellerId.toString(),
                    listingTitle,
                    orderId,
                    outcome,
                    note: adminNote,
                }),
            ])
        }

        // 🔴 BUYER WINS
        else {
            order.status = ORDER_STATUS.CANCELLED
            await order.save()

            if (earningsWereHeld) {
                // 🔁 INTERNAL REVERSAL ONLY
                await cbcService.reverseHeldEarnings(
                    order.sellerId.toString(),
                    order.sellerEarningsNGN,
                    order._id.toString(),
                    `Dispute resolved in favour of buyer: ${adminNote}`,
                )
            } else {
                // 💸 NO ESCROW → REFUND VIA PAYSTACK
                if (order.paymentReference) {
                    await initiateRefund(order.paymentReference)
                }
            }

            await Promise.all([
                notificationService.create({
                    userId: order.buyerId.toString(),
                    type: NOTIFICATION_TYPE.ORDER_UPDATE,
                    title: 'Dispute resolved in your favour',
                    body: `Order cancelled.`,
                    data: { orderId },
                }),
                notificationService.create({
                    userId: order.sellerId.toString(),
                    type: NOTIFICATION_TYPE.ORDER_UPDATE,
                    title: 'Dispute resolved',
                    body: `Resolved in favour of buyer.`,
                    data: { orderId },
                }),
                emailQueue.add('order-dispute-resolved', {
                    buyerId: order.buyerId.toString(),
                    sellerId: order.sellerId.toString(),
                    listingTitle,
                    orderId,
                    outcome,
                    note: adminNote,
                }),
            ])
        }

        return this._populateOrder(order._id)
    }
    // ── Cancel order (before in_progress) ────────────────────────────────────
    async cancelOrder(orderId: string, userId: string) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')

        const isParticipant =
            order.buyerId.toString() === userId ||
            order.sellerId.toString() === userId
        if (!isParticipant)
            throw new ForbiddenError('You are not a participant in this order')

        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
            throw new ConflictError(
                'Order cannot be cancelled once payment is confirmed. Please raise a dispute.',
            )
        }

        order.status = ORDER_STATUS.CANCELLED
        await order.save()

        const otherParty =
            order.buyerId.toString() === userId ? order.sellerId : order.buyerId

        await notificationService.create({
            userId: otherParty,
            type: NOTIFICATION_TYPE.ORDER_UPDATE,
            title: 'Order cancelled',
            body: 'An order has been cancelled before payment was confirmed.',
            data: { orderId: order._id.toString() },
        })

        return await this._populateOrder(order._id)
    }
    async cancelOrderAsSeller(
        orderId: string,
        sellerId: string,
        reason: string,
    ) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')
        if (order.sellerId.toString() !== sellerId) {
            throw new ForbiddenError('Only the seller can cancel this order')
        }
        if (order.status !== ORDER_STATUS.IN_PROGRESS) {
            throw new ConflictError(
                'Order can only be cancelled while in progress and before delivery',
            )
        }

        order.status = ORDER_STATUS.CANCELLED
        order.cancelledBySeller = true
        order.sellerCancelReason = reason
        await order.save()

        // Increment cancel count and flag at 5
        const updatedSeller = await User.findByIdAndUpdate(
            sellerId,
            { $inc: { sellerCancelCount: 1 } },
            { new: true },
        )

        const isFlagged = (updatedSeller?.sellerCancelCount ?? 0) >= 5

        if (isFlagged) {
            await User.findByIdAndUpdate(sellerId, { isFlagged: true })
        }

        await Promise.all([
            notificationService.create({
                userId: order.buyerId.toString(),
                type: NOTIFICATION_TYPE.ORDER_UPDATE,
                title: 'Order cancelled by seller',
                body: `The seller cancelled your order. A refund will be processed.`,
                data: { orderId: order._id.toString() },
            }),
            // Warn the seller when flagged
            isFlagged
                ? notificationService.create({
                      userId: sellerId,
                      type: NOTIFICATION_TYPE.ORDER_UPDATE,
                      title: 'Account flagged',
                      body: `Your account has been flagged due to ${updatedSeller!.sellerCancelCount} order cancellations. Further cancellations may result in suspension.`,
                      data: {
                          sellerCancelCount: updatedSeller!.sellerCancelCount,
                      },
                  })
                : Promise.resolve(),
            emailQueue.add('order-cancelled-by-seller', {
                buyerId: order.buyerId.toString(),
                sellerId,
                orderId,
                reason,
                isFlagged,
            }),
        ])

        return order
    }
    // ── My orders as buyer ────────────────────────────────────────────────────
    async myOrdersBuying(userId: string, opts: PaginationOptions) {
        return paginate(
            Order,
            { buyerId: new mongoose.Types.ObjectId(userId) },
            opts,
            undefined,
            [
                {
                    path: 'sellerId',
                    select: 'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
                },
                {
                    path: 'listingId',
                    select: 'title category tiers',
                },
            ],
        )
    }
    // ── My orders as seller ───────────────────────────────────────────────────
    async myOrdersSelling(userId: string, opts: PaginationOptions) {
        return paginate(
            Order,
            { sellerId: new mongoose.Types.ObjectId(userId) },
            opts,
            undefined,
            [
                {
                    path: 'buyerId',
                    select: 'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
                },
                {
                    path: 'listingId',
                    select: 'title category tiers',
                },
            ],
        )
    }
    // ── Get single order ──────────────────────────────────────────────────────
    async getOrder(orderId: string, userId: string) {
        const order = await Order.findById(orderId)
            .populate(
                'buyerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
            )
            .populate(
                'sellerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge slug',
            )
            .populate('listingId', 'title category tiers')
            .lean()
        if (!order) throw new NotFoundError('Order')

        const isParticipant =
            (
                order.buyerId as unknown as { _id: mongoose.Types.ObjectId }
            )._id?.toString() === userId ||
            (
                order.sellerId as unknown as { _id: mongoose.Types.ObjectId }
            )._id?.toString() === userId
        if (!isParticipant) throw new ForbiddenError('Access denied')

        return order
    }
    async initiateOrderPayment(userId: string, orderId: string, email: string) {
        const order = await Order.findById(orderId)
        if (!order) throw new NotFoundError('Order')

        if (order.buyerId.toString() !== userId) {
            throw new ForbiddenError('Only buyer can pay')
        }
        if (order.escrowConfirmed) {
            throw new ConflictError('Already paid')
        }
        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
            throw new ConflictError('Order not ready for payment')
        }
        if (!order.escrowReference) {
            throw new ConflictError('Escrow reference missing')
        }

        return initializeTransaction(
            email,
            order.amount,
            order.escrowReference,
            {
                userId,
                type: 'escrow',
                orderId: order._id.toString(),
            },
        )
    }
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
            // Non-fatal
        }
    }
    // ── Populate helper ───────────────────────────────────────────────────────
    private async _populateOrder(orderId: mongoose.Types.ObjectId) {
        return Order.findById(orderId)
            .populate(
                'buyerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge',
            )
            .populate(
                'sellerId',
                'firstName lastName displayName avatar averageRating identityVerificationBadge',
            )
            .populate('listingId', 'title category tiers')
            .lean()
    }
}
