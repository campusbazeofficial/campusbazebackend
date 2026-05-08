import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import User from '../models/user.model.js'
import Company from '../models/company.model.js'
import Session from '../models/session.model.js'
import Errand from '../models/errand.model.js'
import Order from '../models/order.model.js'
import ServiceListing from '../models/services.model.js'
import Notification from '../models/notification.model.js'
import { Wallet, WalletTransaction } from '../models/wallet.model.js'
import { UAParser } from 'ua-parser-js'
import {
    NotFoundError,
    ForbiddenError,
    BadRequestError,
    ConflictError,
    ValidationError,
} from '../utils/appError.js'
import {
    uploadToCloudinary,
    deleteFromCloudinary,
} from '../middlewares/upload.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import { USER_ROLE } from '../utils/constant.js'
import type {
    ActivityItem,
    DashboardResponse,
    IndividualDashboard,
    CorporateDashboard,
} from '../types/dashboard.types.js'
import { generateProfileBio } from '../utils/ai.js'
import Skill from '../models/skill.model.js'
import EarningsClearance, { CLEARANCE_STATUS } from '../models/earnin.js'
import Verification from '../models/verification.model.js'
import geoip from 'geoip-lite'
import Subscription from '../models/subscription.model.js'
export interface UpdateIndividualProfileDto {
    firstName?: string
    lastName?: string
    displayName?: string
    bio?: string
    phone?: string
    location?: {
        state?: string
        localGovt?: string
        village?: string
    }
    institutionName?: string
    yearOfStudy?: number
}

export interface UpdateCorporateProfileDto {
    firstName?: string
    lastName?: string
    displayName?: string
    bio?: string
    phone?: string
        location?: {
        state?: string
        localGovt?: string
        village?: string
    }
    companyName?: string
    companyPhone?: string
    description?: string
    website?: string
    industry?: string
    address?: string
    state?: string
}

interface SearchUsersOptions extends PaginationOptions {
    role?: string
    query?: string
    isStudent?: boolean
}

type ParsedSession = {
    _id: mongoose.Types.ObjectId
    deviceInfo: string
    ipAddress: string
    createdAt: Date
    expiresAt: Date
    isCurrent: boolean
}

type StatusCount = { _id: string; count: number }

function sumByStatus(stats: StatusCount[], statuses: string[]): number {
    return stats
        .filter((s) => statuses.includes(s._id))
        .reduce((acc, s) => acc + s.count, 0)
}

function toId(doc: { _id: unknown }): string {
    return (doc._id as mongoose.Types.ObjectId).toString()
}

export class UserService extends BaseService {
    async getMe(userId: string) {
        const user = await User.findById(userId).lean()
        if (!user) throw new NotFoundError('User')

        let company = null
        if (user.companyId) {
            company = await Company.findById(user.companyId).lean()
        }

        return { user, company }
    }

    async updateIndividualProfile(
        userId: string,
        dto: UpdateIndividualProfileDto,
    ) {
        const user = await User.findById(userId)
        if (!user) throw new NotFoundError('User')
        if (user.role === USER_ROLE.CORPORATE) {
            throw new ForbiddenError(
                'Corporate accounts must use the corporate profile update endpoint',
            )
        }

        const allowed: (keyof UpdateIndividualProfileDto)[] = [
            'firstName',
            'lastName',
            'displayName',
            'bio',
            'phone',
            'location',
        ]

        if (user.role === USER_ROLE.STUDENT) {
            allowed.push('institutionName', 'yearOfStudy')
        }

        for (const key of allowed) {
            if (dto[key] !== undefined) {
                ;(user as unknown as Record<string, unknown>)[key] = dto[key]
            }
        }
        if (dto.location) {
            user.location = {
                state: dto.location.state ?? user.location?.state ?? '',
                localGovt:
                    dto.location.localGovt ?? user.location?.localGovt ?? '',
                village: dto.location.village ?? user.location?.village,
            }
        }

        await user.save()
        return user.getPublicProfile()
    }

    async updateCorporateProfile(
        userId: string,
        dto: UpdateCorporateProfileDto,
    ) {
        const user = await User.findById(userId)
        if (!user) throw new NotFoundError('User')
        if (user.role !== USER_ROLE.CORPORATE) {
            throw new ForbiddenError(
                'Only corporate accounts can use the corporate profile update endpoint',
            )
        }
        if (!user.companyId) throw new NotFoundError('Company profile')

        const company = await Company.findById(user.companyId)
        if (!company) throw new NotFoundError('Company')
        const directorFields: (keyof UpdateCorporateProfileDto)[] = [
            'firstName',
            'lastName',
            'displayName',
            'bio',
            'phone',
            'location',
        ]
        for (const key of directorFields) {
            if (dto[key] !== undefined) {
                ;(user as unknown as Record<string, unknown>)[key] = dto[key]
            }
        }
        if (dto.location) {
            user.location = {
                state: dto.location.state ?? user.location?.state ?? '',
                localGovt:
                    dto.location.localGovt ?? user.location?.localGovt ?? '',
                village: dto.location.village ?? user.location?.village,
            }
        }
        if (dto.companyName !== undefined) company.name = dto.companyName
        if (dto.companyPhone !== undefined) company.phone = dto.companyPhone
        if (dto.description !== undefined) company.description = dto.description
        if (dto.website !== undefined) company.website = dto.website
        if (dto.industry !== undefined) company.industry = dto.industry
        if (dto.address !== undefined) company.address = dto.address
        if (dto.state !== undefined) company.state = dto.state
        const [, updatedCompany] = await Promise.all([
            user.save(),
            company.save(),
        ])

        return {
            user: user.getPublicProfile(),
            company: updatedCompany,
        }
    }

    async uploadAvatar(userId: string, fileBuffer: Buffer): Promise<string> {
        const user = await User.findById(userId).select('+avatarPublicId')
        if (!user) throw new NotFoundError('User')

        if (user.avatarPublicId) {
            await deleteFromCloudinary(user.avatarPublicId).catch(() => null)
        }

        const result = await uploadToCloudinary(
            fileBuffer,
            'campusbaze/avatars',
        )
        user.avatar = result.secure_url
        user.avatarPublicId = result.public_id
        await user.save({ validateBeforeSave: false })

        return result.secure_url
    }

    async deleteAvatar(userId: string): Promise<void> {
        const user = await User.findById(userId).select('+avatarPublicId')
        if (!user) throw new NotFoundError('User')
        if (!user.avatar)
            throw new BadRequestError('No profile image to delete')

        if (user.avatarPublicId) {
            await deleteFromCloudinary(user.avatarPublicId).catch(() => null)
        }

        user.avatar = undefined
        user.avatarPublicId = undefined
        await user.save({ validateBeforeSave: false })
    }

    async uploadCompanyLogo(
        userId: string,
        fileBuffer: Buffer,
    ): Promise<string> {
        const user = await User.findById(userId)
        if (!user || user.role !== USER_ROLE.CORPORATE) {
            throw new ForbiddenError(
                'Only corporate accounts can upload a company logo',
            )
        }

        const company = await Company.findById(user.companyId).select(
            '+logoPublicId',
        )
        if (!company) throw new NotFoundError('Company')

        if (company.logoPublicId) {
            await deleteFromCloudinary(company.logoPublicId).catch(() => null)
        }

        const result = await uploadToCloudinary(fileBuffer, 'campusbaze/logos')
        company.logo = result.secure_url
        company.logoPublicId = result.public_id
        await company.save()

        return result.secure_url
    }

    async getPublicProfile(identifier: string, requestingUserId?: string) {
        const user = await User.findOne({
            $or: [
                { slug: identifier },
                ...(mongoose.Types.ObjectId.isValid(identifier)
                    ? [{ _id: new mongoose.Types.ObjectId(identifier) }]
                    : []),
            ],
        })
            .select(
                '-password -emailOtp -emailOtpExpires -phoneOtp -phoneOtpExpires ' +
                    '-passwordResetToken -passwordResetExpires',
            )
            .lean()

        if (!user || !user.isActive || user.isSuspended)
            throw new NotFoundError('User')

        const isOwnProfile =
            !!requestingUserId && user._id.toString() === requestingUserId

        let company = null
        if (user.companyId) {
            company = await Company.findById(user.companyId)
                .select('-ownerId -logoPublicId')
                .lean()
        }

        const [recentOrders, recentErrands] = await Promise.all([
            Order.find({ sellerId: user._id, status: 'completed' })
                .sort({ updatedAt: -1 })
                .limit(3)
                .select('title price completedAt createdAt listingId')
                .populate('listingId', 'title')
                .lean(),
            Errand.find({ runnerId: user._id, status: 'completed' })
                .sort({ updatedAt: -1 })
                .limit(3)
                .select('title agreedAmount updatedAt createdAt')
                .lean(),
        ])

        const profileUrl = `${process.env.CLIENT_URL}/u/${user.slug}`

        return {
            user,
            company,
            profileUrl,
            recentOrders,
            recentErrands,
            isOwnProfile,
        }
    }

    async getSessions(
        userId: string,
        currentSessionId: string,
    ): Promise<ParsedSession[]> {
        const sessions = await Session.find({
            userId: new mongoose.Types.ObjectId(userId),
            isRevoked: false,
            expiresAt: { $gt: new Date() },
        })
            .select('deviceInfo ipAddress createdAt expiresAt')
            .sort({ createdAt: -1 })
            .lean()

        return sessions.map((session) => {
            const ua = new UAParser(session.deviceInfo).getResult()
            const browser = ua.browser.name ?? 'Unknown browser'
            const os = ua.os.name ?? 'Unknown OS'
            // AFTER
            const vendor = ua.device.vendor // e.g. "Apple", "Samsung"
            const model = ua.device.model // e.g. "iPhone", "Galaxy S21"
            const device =
                vendor && model
                    ? `${vendor} ${model}` // → "Apple iPhone", "Samsung Galaxy S21"
                    : vendor
                      ? vendor // → "Apple"
                      : ua.device.type === 'mobile'
                        ? 'Mobile' // → fallback for unrecognised mobile
                        : 'Desktop' // → fallback for desktop or unrecognised
            const geo = geoip.lookup(session.ipAddress ?? '')

            const location = geo
                ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ') // → "Lagos, Lagos, NG"
                : 'Unknown location'
            return {
                _id: session._id as mongoose.Types.ObjectId,
                deviceInfo: `${browser} on ${os} (${device})`,
                location,
                ipAddress: session.ipAddress ?? 'Unknown',
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                isCurrent: session._id.toString() === currentSessionId,
            }
        })
    }

    async searchUsers(
        opts: SearchUsersOptions & { requestingUserId?: string },
    ) {
        const filter: any = {
            isActive: true,
            isSuspended: false,
        }

        // Exclude the requesting user from results
        if (opts.requestingUserId) {
            filter._id = {
                $ne: new mongoose.Types.ObjectId(opts.requestingUserId),
            }
        }

        if (opts.isStudent !== undefined) filter.isStudent = opts.isStudent

        if (opts.query) {
            const escaped = opts.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = { $regex: escaped, $options: 'i' }

            filter.$or = [
                { firstName: regex },
                { lastName: regex },
                { displayName: regex },
            ]
        }

        return paginate(
            User,
            filter,
            {
                page: opts.page ?? 1,
                limit: opts.limit ?? 20,
                sort: 'subscriptionWeight',
                order: opts.order,
            },
            '-password -emailOtp -emailOtpExpires -phoneOtp -phoneOtpExpires ' +
                '-passwordResetToken -passwordResetExpires',
        )
    }

    async getDashboard(userId: string): Promise<DashboardResponse> {
        const uid = new mongoose.Types.ObjectId(userId)

        const [
            user,
            wallet,
            errandPostedStats,
            errandRunnerStats,
            listingStats,
            orderBuyerStats,
            orderSellerStats,
            unreadNotifications,
            recentErrandsPosted,
            recentErrandsRun,
            recentOrdersBuying,
            recentOrdersSelling,
            pendingErrandsPosted,
            pendingOrdersSelling,
            approvedEarnings, // ✅ ADD — replaces the two broken aggregations
        ] = await Promise.all([
            User.findById(uid)
                .select(
                    'firstName lastName displayName avatar role isStudent companyId ' +
                        'subscriptionTier identityVerificationStatus identityVerificationBadge ' +
                        'averageRating totalReviews referralCode totalOrdersCompleted institutionName',
                )
                .lean(),

            Wallet.findOne({ userId: uid }).select('balance').lean(),

            Errand.aggregate<StatusCount>([
                { $match: { posterId: uid } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            Errand.aggregate<StatusCount>([
                { $match: { runnerId: uid } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            ServiceListing.aggregate<StatusCount>([
                { $match: { sellerId: uid } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            Order.aggregate<StatusCount>([
                { $match: { buyerId: uid } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            Order.aggregate<StatusCount>([
                { $match: { sellerId: uid } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),

            Notification.countDocuments({ userId: uid, isRead: false }),

            Errand.find({ posterId: uid })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('title status budget category deadline updatedAt')
                .lean(),

            Errand.find({ runnerId: uid })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('title status agreedAmount category updatedAt')
                .lean(),

            Order.find({ buyerId: uid })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('amount status tierName deliveryDue updatedAt')
                .populate('listingId', 'title category')
                .lean(),

            Order.find({ sellerId: uid })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select(
                    'amount sellerEarningsNGN status tierName deliveryDue updatedAt',
                )
                .populate('listingId', 'title category')
                .lean(),

            Errand.find({
                posterId: uid,
                status: {
                    $in: ['posted', 'accepted', 'in_progress', 'completed'],
                },
            })
                .sort({ deadline: 1 })
                .limit(10)
                .select(
                    'title status budget category deadline bids runnerId updatedAt',
                )
                .lean(),

            Order.find({
                sellerId: uid,
                status: { $in: ['in_progress', 'revision'] },
            })
                .sort({ deliveryDue: 1 })
                .limit(10)
                .select(
                    'amount sellerEarningsNGN status tierName deliveryDue updatedAt',
                )
                .populate('listingId', 'title category')
                .lean(),

            // ✅ Single source of truth — only admin-approved clearances count
            EarningsClearance.aggregate<{ _id: null; total: number }>([
                {
                    $match: {
                        userId: uid,
                        status: CLEARANCE_STATUS.APPROVED,
                    },
                },
                {
                    $group: { _id: null, total: { $sum: '$amountNGN' } },
                },
            ]),
        ])

        if (!user) throw new NotFoundError('User')

        // ✅ Safe — approved clearances only, 0 if none yet
        const totalEarnedNGN = approvedEarnings[0]?.total ?? 0

        type PopulatedListing = { title: string; category?: string }

        const recentActivity: ActivityItem[] = [
            ...recentErrandsPosted.map((e) => ({
                type: 'errand_posted' as const,
                refId: e._id.toString(),
                title: e.title as string,
                status: e.status as string,
                amountNGN: e.budget as number,
                category: e.category as string,
                updatedAt: e.updatedAt as Date,
            })),
            ...recentErrandsRun.map((e) => ({
                type: 'errand_running' as const,
                refId: e._id.toString(),
                title: e.title as string,
                status: e.status as string,
                amountNGN: (e.agreedAmount as number) ?? 0,
                category: e.category as string,
                updatedAt: e.updatedAt as Date,
            })),
            ...recentOrdersBuying.map((o) => ({
                type: 'order_placed' as const,
                refId: o._id.toString(),
                title:
                    (o.listingId as unknown as PopulatedListing)?.title ??
                    'Service Order',
                status: o.status as string,
                amountNGN: o.amount as number,
                category: (o.listingId as unknown as PopulatedListing)
                    ?.category,
                updatedAt: o.updatedAt as Date,
            })),
            ...recentOrdersSelling.map((o) => ({
                type: 'order_received' as const,
                refId: o._id.toString(),
                title:
                    (o.listingId as unknown as PopulatedListing)?.title ??
                    'Service Order',
                status: o.status as string,
                amountNGN: (o.sellerEarningsNGN as number) ?? 0,
                category: (o.listingId as unknown as PopulatedListing)
                    ?.category,
                updatedAt: o.updatedAt as Date,
            })),
        ]
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            )
            .slice(0, 10)

        const base = {
            profile: {
                displayName: user.displayName,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: (user.avatar as string | undefined) ?? null,
                role: user.role,
                isStudent: user.isStudent,
                subscriptionTier: user.subscriptionTier,
                identityStatus: user.identityVerificationStatus,
                identityBadge: user.identityVerificationBadge,
                averageRating: user.averageRating,
                totalReviews: user.totalReviews,
                referralCode: user.referralCode,
                totalOrdersCompleted: user.totalOrdersCompleted,
            },
            wallet: {
                cbcBalance: wallet?.balance ?? 0,
                totalEarnedNGN, // ✅ was incorrectly passing raw approvedEarnings array
            },
            errands: {
                posted: {
                    total: errandPostedStats.reduce((a, s) => a + s.count, 0),
                    open: sumByStatus(errandPostedStats, ['posted']),
                    active: sumByStatus(errandPostedStats, [
                        'accepted',
                        'in_progress',
                    ]),
                    awaitingConfirm: sumByStatus(errandPostedStats, [
                        'completed',
                    ]),
                    confirmed: sumByStatus(errandPostedStats, ['confirmed']),
                    cancelled: sumByStatus(errandPostedStats, ['cancelled']),
                    disputed: sumByStatus(errandPostedStats, ['disputed']),
                },
                running: {
                    total: errandRunnerStats.reduce((a, s) => a + s.count, 0),
                    active: sumByStatus(errandRunnerStats, [
                        'accepted',
                        'in_progress',
                    ]),
                    awaitingConfirm: sumByStatus(errandRunnerStats, [
                        'completed',
                    ]),
                    completed: sumByStatus(errandRunnerStats, ['confirmed']),
                    disputed: sumByStatus(errandRunnerStats, ['disputed']),
                },
            },
            services: {
                listings: {
                    total: listingStats.reduce((a, s) => a + s.count, 0),
                    active: sumByStatus(listingStats, ['active']),
                    paused: sumByStatus(listingStats, ['paused']),
                    draft: sumByStatus(listingStats, ['draft']),
                },
                ordersBuying: {
                    total: orderBuyerStats.reduce((a, s) => a + s.count, 0),
                    active: sumByStatus(orderBuyerStats, [
                        'in_progress',
                        'delivered',
                        'revision',
                    ]),
                    completed: sumByStatus(orderBuyerStats, ['completed']),
                    disputed: sumByStatus(orderBuyerStats, ['disputed']),
                },
                ordersSelling: {
                    total: orderSellerStats.reduce((a, s) => a + s.count, 0),
                    active: sumByStatus(orderSellerStats, [
                        'in_progress',
                        'revision',
                    ]),
                    awaitingConfirm: sumByStatus(orderSellerStats, [
                        'delivered',
                    ]),
                    completed: sumByStatus(orderSellerStats, ['completed']),
                    disputed: sumByStatus(orderSellerStats, ['disputed']),
                },
            },
            pendingErrands: pendingErrandsPosted,
            pendingOrders: pendingOrdersSelling,
            recentActivity,
            unreadNotifications,
        }

        if (user.role === USER_ROLE.CORPORATE && user.companyId) {
            const [company, totalSpendResult] = await Promise.all([
                Company.findById(user.companyId)
                    .select(
                        'name logo verificationStatus verificationBadge totalOrdersCompleted averageRating',
                    )
                    .lean(),
                Order.aggregate<{ _id: null; total: number }>([
                    { $match: { buyerId: uid, status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]),
            ])

            const corporate: CorporateDashboard = {
                ...base,
                accountType: 'corporate',
                company: {
                    name: company?.name ?? '',
                    logo: (company?.logo as string | undefined) ?? null,
                    verificationStatus:
                        company?.verificationStatus ?? 'unverified',
                    verificationBadge: company?.verificationBadge ?? false,
                    totalSpendNGN: totalSpendResult[0]?.total ?? 0,
                    totalOrdersCompleted: company?.totalOrdersCompleted ?? 0,
                    averageRating: company?.averageRating ?? 0,
                },
            }
            return corporate
        }

        const individual: IndividualDashboard = {
            ...base,
            accountType: 'individual',
        }
        return individual
    }

    async generateBio(userId: string): Promise<string> {
        const [user, skills] = await Promise.all([
            User.findById(userId).select('firstName role isStudent').lean(),
            Skill.find({ userId: new mongoose.Types.ObjectId(userId) })
                .select('name')
                .lean(),
        ])

        if (!user) throw new NotFoundError('User')

        const skillNames = skills.map((s) => s.name)

        const roleLabel =
            user.role === USER_ROLE.CORPORATE
                ? 'business / company representative'
                : user.isStudent
                  ? 'student'
                  : 'independent professional'

        return generateProfileBio(user.firstName, roleLabel, skillNames)
    }

    async deleteAccount(
        userId: string,
        confirmationText: string,
    ): Promise<void> {
        const uid = new mongoose.Types.ObjectId(userId)
        const user = await User.findById(uid)
            .select('+avatarPublicId companyId role firstName lastName')
            .lean()
        if (!user) throw new NotFoundError('User')

        // ── Confirmation phrase check ─────────────────────────────────────────
        const fullName = `${user.firstName}-${user.lastName}`
        const expected = `sudo-delete-${fullName}`

        if (confirmationText.trim() !== expected) {
            throw new ValidationError(
                `Confirmation text does not match. Please type exactly: sudo-delete-${fullName}`,
            )
        }

        // ── Block deletion if user has active obligations ─────────────────────
        const [activeErrands, activeOrders, activeBids] = await Promise.all([
            Errand.exists({
                $or: [{ posterId: uid }, { runnerId: uid }],
                status: { $in: ['accepted', 'in_progress'] },
            }),
            Order.exists({
                $or: [{ buyerId: uid }, { sellerId: uid }],
                status: { $in: ['in_progress', 'delivered', 'revision'] },
            }),
            // Block if user has an accepted bid on someone else's active errand
            Errand.exists({
                'bids.runnerId': uid,
                'bids.status': 'accepted',
                status: { $in: ['accepted', 'in_progress'] },
            }),
        ])

        if (activeErrands) {
            throw new ConflictError(
                'You have active errands in progress. Please complete or cancel them before deleting your account.',
            )
        }
        if (activeOrders) {
            throw new ConflictError(
                'You have active orders in progress. Please complete or cancel them before deleting your account.',
            )
        }
        if (activeBids) {
            throw new ConflictError(
                'You have an accepted bid on an active errand. Please wait for it to complete or be cancelled before deleting your account.',
            )
        }

        // ── Cloudinary cleanup ────────────────────────────────────────────────
        if (user.avatarPublicId) {
            await deleteFromCloudinary(user.avatarPublicId).catch(() => null)
        }

        if (user.role === USER_ROLE.CORPORATE && user.companyId) {
            const company = await Company.findById(user.companyId)
                .select('+logoPublicId')
                .lean()
            if (company?.logoPublicId) {
                await deleteFromCloudinary(company.logoPublicId).catch(
                    () => null,
                )
            }
        }

        // ── Wipe all user data in parallel ────────────────────────────────────
        await Promise.all([
            // ── Core records ──────────────────────────────────────────────────
            User.findByIdAndDelete(uid),
            Wallet.findOneAndDelete({ userId: uid }),
            WalletTransaction.deleteMany({ userId: uid }),
            Session.deleteMany({ userId: uid }),
            Notification.deleteMany({ userId: uid }),

            // ── Errands ───────────────────────────────────────────────────────
            // Delete all errands posted by user
            Errand.deleteMany({ posterId: uid }),
            // Delete all errands where user was the runner (active ones blocked above)
            Errand.deleteMany({ runnerId: uid }),
            // Remove all bids placed by user on other people's errands
            Errand.updateMany(
                { 'bids.runnerId': uid },
                { $pull: { bids: { runnerId: uid } } },
            ),

            // ── Services & Orders ─────────────────────────────────────────────
            // Delete all service listings
            ServiceListing.deleteMany({ sellerId: uid }),
            // Delete all orders as buyer
            Order.deleteMany({ buyerId: uid }),
            // Delete all orders as seller (active ones blocked above)
            Order.deleteMany({ sellerId: uid }),

            // ── Supporting records ────────────────────────────────────────────
            Verification.deleteMany({ userId: uid }),
            EarningsClearance.deleteMany({ userId: uid }),
            Skill.deleteMany({ userId: uid }),
            Subscription.deleteMany({ userId: uid }),

            // ── Corporate — only delete company if this user owns it ──────────
            ...(user.role === USER_ROLE.CORPORATE && user.companyId
                ? [Company.findByIdAndDelete(user.companyId)]
                : []),
        ])
    }
}
