import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { validate } from '../middlewares/validate.js'
import { sendSuccess, sendPaginated } from '../utils/response.js'
import { paginate, parsePaginationQuery } from '../utils/paginate.js'
import User from '../models/user.model.js'
import Company from '../models/company.model.js'
import Errand from '../models/errand.model.js'
import Order from '../models/order.model.js'
import Subscription from '../models/subscription.model.js'
import Verification from '../models/verification.model.js'
import { CbcService } from '../services/cbc.service.js'
import { NotificationService } from '../services/notification.service.js'
import { ErrandService } from '../services/errand.service.js'
import { ServiceListingService } from '../services/services.service.js'
import Wallet, { WALLET_TX_TYPE } from '../models/wallet.model.js'
import { NOTIFICATION_TYPE, ORDER_STATUS } from '../utils/constant.js'
import AppError, {
    ConflictError,
    NotFoundError,
    ValidationError,
} from '../utils/appError.js'
import EarningsClearance, { CLEARANCE_STATUS } from '../models/earnin.js'
import mongoose from 'mongoose'
import dayjs from 'dayjs'
import { EarningsClearanceService } from '../services/earnings-clearance.service.js'
import { emailQueue } from '../utils/queue.js'
import { getPrivateDownloadUrl, getSignedUrl } from '../middlewares/upload.js'
import { emitToUser } from '../utils/socketHelper.js'

const clearanceService = new EarningsClearanceService()
const cbcService = new CbcService()
const notificationService = new NotificationService()
const errandService = new ErrandService()
const serviceService = new ServiceListingService()

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const suspendUserSchema = z.object({
    reason: z.string().min(5, 'Reason must be at least 5 characters').max(300),
})

export const cbcCreditSchema = z.object({
    userId: z.string().min(1),
    amount: z.number().int().positive('Amount must be a positive integer'),
    note: z.string().max(200).optional(),
})

export const validateSuspendUser = validate(suspendUserSchema)
export const validateCbcCredit = validate(cbcCreditSchema)

// ─── Users ────────────────────────────────────────────────────────────────────

export const listUsers = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const filter: Record<string, unknown> = {}

        if (req.query.role) filter.role = req.query.role
        if (req.query.isSuspended === 'true') filter.isSuspended = true
        if (req.query.isSuspended === 'false') filter.isSuspended = false

        const result = await paginate(
            User,
            filter,
            opts,
            '-password -emailOtp -emailOtpExpires -emailOtpAttempts ' +
                '-emailOtpBlockedUntil -emailOtpLastSentAt -phoneOtp -phoneOtpExpires ' +
                '-passwordResetToken -passwordResetExpires',
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

// export const getUserDetail = async (
//     req: Request,
//     res: Response,
//     next: NextFunction,
// ): Promise<void> => {
//     try {
//         const user = await User.findById(req.params.userId)
//             .select(
//                 '-password -emailOtp -emailOtpExpires -emailOtpAttempts ' +
//                     '-emailOtpBlockedUntil -emailOtpLastSentAt -phoneOtp -phoneOtpExpires ' +
//                     '-passwordResetToken -passwordResetExpires',
//             )
//             .lean()
//         if (!user) throw new NotFoundError('User')
//         const [company, referralCount] = await Promise.all([
//             user.companyId ? Company.findById(user.companyId).lean() : null,
//             User.countDocuments({ referredBy: user._id }),
//         ])

//         if (user.companyId) {
//             company = await Company.findById(user.companyId).lean()
//         }

//         sendSuccess(res, { user, company })
//     } catch (err) {
//         next(err)
//     }
// }

export const getUserDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const user = await User.findById(req.params.userId)
            .select(
                '-password -emailOtp -emailOtpExpires -emailOtpAttempts ' +
                    '-emailOtpBlockedUntil -emailOtpLastSentAt -phoneOtp -phoneOtpExpires ' +
                    '-passwordResetToken -passwordResetExpires',
            )
            .lean()
        if (!user) throw new NotFoundError('User')

        const [company, referralCount] = await Promise.all([
            user.companyId ? Company.findById(user.companyId).lean() : null,
            User.countDocuments({ referredBy: user._id }),
        ])

        sendSuccess(res, { user, company, referralCount })
    } catch (err) {
        next(err)
    }
}

export const suspendUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const user = await User.findById(req.params.userId)
        if (!user) throw new NotFoundError('User')

        const isNowSuspended = !user.isSuspended
        user.isSuspended = isNowSuspended
        user.suspendedReason = isNowSuspended
            ? (req.body as { reason: string }).reason
            : undefined
        user.isActive = !isNowSuspended
        await user.save({ validateBeforeSave: false })

        sendSuccess(res, {
            message: isNowSuspended ? 'User suspended' : 'User unsuspended',
            userId: user._id,
            isSuspended: user.isSuspended,
        })
    } catch (err) {
        next(err)
    }
}

// ─── CBC ──────────────────────────────────────────────────────────────────────

export const adminCreditCbc = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { userId, amount, note } = req.body as z.infer<
            typeof cbcCreditSchema
        >
        await cbcService.credit(
            userId,
            amount,
            WALLET_TX_TYPE.ADMIN_CREDIT,
            note ?? 'Admin credit',
        )

        // Notify the user
        notificationService
            .create({
                userId,
                type: NOTIFICATION_TYPE.CBC_CREDIT,
                title: 'CBC coins credited',
                body: `${amount} CBC coins have been added to your wallet by an admin.${note ? ` Note: ${note}` : ''}`,
                data: { amount, note },
            })
            .catch(() => null)

        sendSuccess(res, {
            message: `${amount} CBC credited to user ${userId}`,
        })
    } catch (err) {
        next(err)
    }
}

// ─── Errands ──────────────────────────────────────────────────────────────────

export const listErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const filter: Record<string, unknown> = {}
        if (req.query.status) filter.status = req.query.status
        if (req.query.category) filter.category = req.query.category
        const result = await paginate(
            Errand,
            filter,
            opts,
            '-completionProofPublicId',
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const getErrandDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await Errand.findById(req.params.errandId)
            .populate('posterId', 'firstName lastName email role averageRating')
            .populate('runnerId', 'firstName lastName email averageRating')
            .lean()
        if (!errand) throw new NotFoundError('Errand')
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export const listOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const filter: Record<string, unknown> = {}
        if (req.query.status) filter.status = req.query.status

        const result = await paginate(
            Order,
            filter,
            opts,
            undefined, // ← select (skip it)
            [
                // ← populate (5th arg)
                { path: 'buyerId', select: 'firstName lastName email role' },
                {
                    path: 'sellerId',
                    select: 'firstName lastName email role averageRating',
                },
                { path: 'listingId', select: 'title category tiers' },
            ],
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const getOrderDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('buyerId', 'firstName lastName email role')
            .populate('sellerId', 'firstName lastName email role averageRating')
            .populate('listingId', 'title category tiers')
            .lean()
        if (!order) throw new NotFoundError('Order')
        sendSuccess(res, { order })
    } catch (err) {
        next(err)
    }
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const listSubscriptions = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const filter: Record<string, unknown> = {}
        if (req.query.status) filter.status = req.query.status
        if (req.query.tier) filter.tier = req.query.tier
        const result = await paginate(Subscription, filter, opts)
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const getSubscriptionDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const sub = await Subscription.findById(req.params.subscriptionId)
            .populate(
                'userId',
                'firstName lastName email role subscriptionTier',
            )
            .lean()
        if (!sub) throw new NotFoundError('Subscription')
        sendSuccess(res, { subscription: sub })
    } catch (err) {
        next(err)
    }
}

// ─── Verifications (detail only — list/review live in verifications.controller) ──

export const getVerificationDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const doc = await Verification.findById(req.params.verificationId)
            .populate(
                'userId',
                'firstName lastName email role isStudent isStudentVerified',
            )
            .populate('companyId', 'name verificationStatus')
            .populate('reviewedBy', 'firstName lastName email')
            .lean()
        if (!doc) throw new NotFoundError('Verification submission')

        const { documentPublicId, documentResourceType, ...rest } = doc
        sendSuccess(res, {
            verification: {
                ...rest,
               documentUrl: documentPublicId
    ? documentResourceType === 'raw'
        ? getPrivateDownloadUrl(documentPublicId, 'raw')
        : getSignedUrl(documentPublicId, 'image')
    : (doc.documentUrl ?? null),
            },
        })
    } catch (err) {
        next(err)
    }
}

export const streamVerificationDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const doc = await Verification.findById(req.params.verificationId)
            .select('documentPublicId documentResourceType')
            .lean()

        if (!doc) throw new NotFoundError('Verification submission')

        const url =
            doc.documentResourceType === 'raw'
                ? getPrivateDownloadUrl(doc.documentPublicId, 'raw')
                : getSignedUrl(doc.documentPublicId, 'image')

        res.redirect(url) // no need to return
    } catch (err) {
        next(err)
    }
}

export const resolveDisputeSchema = z.object({
    outcome: z.enum([
        'favour_poster',
        'favour_runner',
        'favour_buyer',
        'favour_seller',
    ]),
    adminNote: z
        .string()
        .min(10, 'Admin note must explain the decision')
        .max(1000),
})

export const validateResolveDispute = validate(resolveDisputeSchema)

/**
 * PATCH /api/v1/admin/errands/:errandId/resolve
 * Resolve a disputed errand.
 * outcome: "favour_poster" | "favour_runner"
 */
export const resolveErrandDispute = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { outcome, adminNote } = req.body as {
            outcome: 'favour_poster' | 'favour_runner'
            adminNote: string
        }
        const result = await errandService.resolveErrandDispute(
            req.params.errandId as string,
            req.user!._id.toString(),
            outcome,
            adminNote,
        )
        sendSuccess(res, {
            message: `Errand dispute resolved — ${outcome.replace('_', ' ')}`,
            errand: result,
        })
    } catch (err) {
        next(err)
    }
}

/**
 * PATCH /api/v1/admin/orders/:orderId/resolve
 * Resolve a disputed service order.
 * outcome: "favour_buyer" | "favour_seller"
 */
export const resolveOrderDispute = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { outcome, adminNote } = req.body as {
            outcome: 'favour_buyer' | 'favour_seller'
            adminNote: string
        }

        const result = await serviceService.resolveOrderDispute(
            req.params.orderId as string,
            req.user!._id.toString(),
            outcome,
            adminNote,
        )

        sendSuccess(res, {
            message: `Order dispute resolved — ${outcome.replace('_', ' ')}`,
            order: result,
        })
    } catch (err) {
        next(err)
    }
}
// ── List pending clearances ───────────────────────────────────────────────────
export const listClearances = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const filter: Record<string, unknown> = {}
        if (req.query.status) filter.status = req.query.status
        else filter.status = CLEARANCE_STATUS.PENDING // default to pending

        const result = await paginate(
            EarningsClearance,
            filter,
            opts,
            undefined,
            [
                { path: 'userId', select: 'firstName lastName email role' },
                { path: 'sourceId', select: 'title amount agreedAmount' },
            ],
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

// ── Approve single clearance ──────────────────────────────────────────────────

export const approveClearance = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const clearance = await clearanceService.approveClearance(
            req.params.clearanceId as string,
            req.user!._id.toString(),
        )
        emitToUser(clearance.userId.toString(), 'clearance:updated', {
            id: clearance._id.toString(),
            status: CLEARANCE_STATUS.APPROVED,
            amountNGN: clearance.amountNGN,
        })

        notificationService
            .create({
                userId: clearance.userId.toString(),
                type: NOTIFICATION_TYPE.PAYMENT,
                title: 'Earnings cleared',
                body: `₦${clearance.amountNGN.toLocaleString()} added to your withdrawable balance.`,
            })
            .catch(() => null)

        sendSuccess(res, {
            message: 'Earnings approved and credited',
            clearance,
        })
    } catch (err) {
        next(err)
    }
}
// ── Reject single clearance ───────────────────────────────────────────────────
export const rejectClearance = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { adminNote } = req.body as { adminNote: string }
        if (!adminNote?.trim()) {
            throw new ValidationError(
                'Admin note is required when rejecting a clearance',
            )
        }

        const clearance = await EarningsClearance.findOneAndUpdate(
            { _id: req.params.clearanceId, status: CLEARANCE_STATUS.PENDING },
            {
                status: CLEARANCE_STATUS.REJECTED,
                reviewedBy: req.user!._id,
                reviewedAt: new Date(),
                adminNote,
            },
            { new: true },
        )
        if (!clearance) throw new NotFoundError('Pending clearance')

        // ── Reverse the pending hold ───────────────────────────────────────────
        await cbcService.reverseHeldEarnings(
            clearance.userId.toString(),
            clearance.amountNGN,
            clearance._id.toString(),
            `Earnings rejected by admin: ${adminNote}`,
        )

        emitToUser(clearance.userId.toString(), 'clearance:updated', {
            id: clearance._id.toString(),
            status: CLEARANCE_STATUS.REJECTED,
            amountNGN: clearance.amountNGN,
            adminNote,
        })
        // ── Mark the source errand/order as needing review ────────────────────
        // We don't set status back to DISPUTED (that's user-raised) — instead
        // we add an adminRejected flag so it's queryable without polluting status flow
        if (clearance.sourceType === 'errand') {
            await Errand.findByIdAndUpdate(clearance.sourceId, {
                earningRejected: true,
                earningRejectedReason: adminNote,
                earningRejectedAt: new Date(),
            })
        } else {
            await Order.findByIdAndUpdate(clearance.sourceId, {
                earningRejected: true,
                earningRejectedReason: adminNote,
                earningRejectedAt: new Date(),
            })
        }

        // ── Notify with clear reason and appeal instructions ───────────────────
        await notificationService.create({
            userId: clearance.userId.toString(),
            type: NOTIFICATION_TYPE.PAYMENT,
            title: 'Earnings not approved',
            body: `Your earnings of ₦${clearance.amountNGN.toLocaleString()} were not approved. Reason: "${adminNote}". If you believe this is an error, please contact support within 72 hours.`,
            data: {
                clearanceId: clearance._id.toString(),
                amountNGN: clearance.amountNGN,
                sourceType: clearance.sourceType,
                sourceId: clearance.sourceId.toString(),
                adminNote,
                appealDeadline: dayjs().add(72, 'hour').toISOString(),
            },
        })

        sendSuccess(res, { message: 'Clearance rejected', clearance })
    } catch (err) {
        next(err)
    }
}

// ── Bulk approve clearances ───────────────────────────────────────────────────
export const bulkApproveClearances = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { clearanceIds } = req.body as { clearanceIds: string[] }
        const adminId = req.user!._id.toString()

        const results = await Promise.allSettled(
            clearanceIds.map((id) =>
                clearanceService.approveClearance(id, adminId),
            ),
        )

        const succeeded = results.filter((r) => r.status === 'fulfilled').length
        const failed = results.filter((r) => r.status === 'rejected').length

        sendSuccess(res, {
            message: `Bulk approval complete: ${succeeded} approved, ${failed} failed`,
            succeeded,
            failed,
        })
    } catch (err) {
        next(err)
    }
}

// In admin.controller.ts
export const reapproveClearance = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const clearance = await EarningsClearance.findOneAndUpdate(
            { _id: req.params.clearanceId, status: CLEARANCE_STATUS.REJECTED },
            {
                status: CLEARANCE_STATUS.APPROVED,
                reviewedBy: req.user!._id,
                reviewedAt: new Date(),
                adminNote: req.body.adminNote ?? 'Appeal approved',
            },
            { new: true },
        )
        if (!clearance) throw new NotFoundError('Rejected clearance')

        // Release to withdrawable — same as normal approval

        await cbcService.creditEarningsDirectly(
            clearance.userId.toString(),
            clearance.amountNGN,
            clearance._id.toString(),
            'Earnings released after appeal approval',
        )
        emitToUser(clearance.userId.toString(), 'clearance:updated', {
            id: clearance._id.toString(),
            status: CLEARANCE_STATUS.APPROVED,
            amountNGN: clearance.amountNGN,
            reapproved: true,
        })
        // Clear the rejection flag on the source
        if (clearance.sourceType === 'errand') {
            await Errand.findByIdAndUpdate(clearance.sourceId, {
                earningRejected: false,
                earningRejectedReason: undefined,
            })
        } else {
            await Order.findByIdAndUpdate(clearance.sourceId, {
                earningRejected: false,
                earningRejectedReason: undefined,
            })
        }

        notificationService
            .create({
                userId: clearance.userId.toString(),
                type: NOTIFICATION_TYPE.PAYMENT,
                title: 'Appeal approved — earnings credited',
                body: `Your appeal was successful. ₦${clearance.amountNGN.toLocaleString()} has been added to your withdrawable balance.`,
                data: {
                    clearanceId: clearance._id.toString(),
                    amountNGN: clearance.amountNGN,
                },
            })
            .catch(() => null)

        sendSuccess(res, {
            message: 'Clearance re-approved after appeal',
            clearance,
        })
    } catch (err) {
        next(err)
    }
}
