import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { NotificationService } from '../services/notification.service.js'
import { SubscriptionService } from '../services/subscription.service.js'
import { validate } from '../middlewares/validate.js'
import { sendSuccess, sendCreated } from '../utils/response.js'
import { parsePaginationQuery } from '../utils/paginate.js'
import { SUBSCRIPTION_TIER } from '../utils/constant.js'

const notificationService = new NotificationService()
const subscriptionService = new SubscriptionService()

// ─── Notification handlers ────────────────────────────────────────────────────

export const listNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { page, limit } = parsePaginationQuery(
            req.query as Record<string, string>,
        )
        const result = await notificationService.list(
            req.user!._id.toString(),
            page,
            limit,
        )
        res.json({
            success: true,
            data: result.notifications,
            unreadCount: result.unreadCount,
            meta: result.meta,
        })
    } catch (err) {
        next(err)
    }
}

export const markNotificationRead = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await notificationService.markRead(
            req.params.notificationId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { message: 'Notification marked as read' })
    } catch (err) {
        next(err)
    }
}

export const markAllNotificationsRead = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await notificationService.markAllRead(req.user!._id.toString())
        sendSuccess(res, { message: 'All notifications marked as read' })
    } catch (err) {
        next(err)
    }
}

export const deleteNotification = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await notificationService.deleteOne(
            req.params.notificationId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { message: 'Notification deleted' })
    } catch (err) {
        next(err)
    }
}

export const getNotification = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const notification = await notificationService.getOne(
            req.params.id as string,
            req.user!._id.toString(),
        )

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' })
        }

        return res.json({ notification })
    } catch (error) {
        next(error)
    }
}
// ─── Subscription handlers (co-located — same route file) ────────────────────
export const getSubscriptionPlans = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = req.user!._id.toString()
        const plans = await subscriptionService.getPlans(userId)
        sendSuccess(res, { plans })
    } catch (err) {
        next(err)
    }
}

export const getMySubscription = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await subscriptionService.getMine(
            req.user!._id.toString(),
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const subscribeSchema = z.object({
    tier: z.enum(Object.values(SUBSCRIPTION_TIER) as [string, ...string[]]),
    billingPeriod: z.enum(['monthly', 'yearly']).default('monthly'),
    callbackUrl: z.string().url().optional(),
})

export const validateSubscribe = validate(subscribeSchema)

export const initializeSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { tier, billingPeriod, callbackUrl } = req.body as z.infer<
            typeof subscribeSchema
        >
        const result = await subscriptionService.initializeSubscription(
            req.user!._id.toString(),
            req.user!.email,
            req.user!.isStudent,
            tier as Parameters<
                typeof subscriptionService.initializeSubscription
            >[3],
            (billingPeriod as 'monthly' | 'yearly') ?? 'monthly',
            callbackUrl,
        )
        sendCreated(res, result)
    } catch (err) {
        next(err)
    }
}

export const cancelSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { note } = req.body as { note?: string }
        await subscriptionService.cancelSubscription(
            req.user!._id.toString(),
            note,
        )
        sendSuccess(res, {
            message:
                'Subscription cancelled. You retain access until the expiry date.',
        })
    } catch (err) {
        next(err)
    }
}

export const upgradeSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { tier, billingPeriod, callbackUrl } = req.body as z.infer<
            typeof subscribeSchema
        >
        const result = await subscriptionService.upgradeSubscription(
            req.user!._id.toString(),
            req.user!.email,
            req.user!.isStudent,
            tier as Parameters<
                typeof subscriptionService.upgradeSubscription
            >[3],
            (billingPeriod as 'monthly' | 'yearly') ?? 'monthly',
            callbackUrl,
        )
        sendCreated(res, result)
    } catch (err) {
        next(err)
    }
}

export const toggleAutoRenew = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await subscriptionService.toggleAutoRenew(
            req.user!._id.toString(),
        )
        sendSuccess(res, {
            message: result.autoRenew
                ? 'Auto-renew enabled'
                : 'Auto-renew disabled',
            autoRenew: result.autoRenew,
        })
    } catch (err) {
        next(err)
    }
}

export const getPublicSubscriptionPlans = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const plans = await subscriptionService.getPublicPlans()
        sendSuccess(res, { plans })
    } catch (err) {
        next(err)
    }
}
