// middlewares/requireFeature.ts
import { Request, Response, NextFunction } from 'express'
import Subscription from '../models/subscription.model.js'
import { SUBSCRIPTION_STATUS } from '../utils/constant.js'
import { ForbiddenError } from '../utils/appError.js'
import mongoose from 'mongoose'

type Feature =
    | 'profileHighlight'
    | 'priorityListings'
    | 'featuredBadge'
    | 'interviewTools'
    | 'dedicatedSupport'
    | 'contractModule'
    | 'analyticsDashboard'
    | 'unlimitedJobPosts'
    | 'apiAccess'

export function requireFeature(feature: Feature) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new ForbiddenError('Authentication required')
            }
            const userId = req.user._id.toString()

            const sub = await Subscription.findOne({
                userId: new mongoose.Types.ObjectId(userId),
                status: SUBSCRIPTION_STATUS.ACTIVE,
                expiresAt: { $gt: new Date() },
            })
                .select('planSnapshot.features')
                .lean()

            const hasFeature = Boolean(sub?.planSnapshot?.features?.[feature])
            if (!hasFeature) {
                throw new ForbiddenError(
                    `Your current plan does not include access to this feature. Please upgrade.`,
                )
            }

            next()
        } catch (err) {
            next(err)
        }
    }
}
