import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Review from '../models/review.model.js'
import User from '../models/user.model.js'
import Order from '../models/order.model.js'
import Errand from '../models/errand.model.js'
import {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
} from '../utils/appError.js'
import { ORDER_STATUS, ERRAND_STATUS } from '../utils/constant.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'

interface SubmitReviewDto {
    refId: string // orderId or errandId
    refType: 'order' | 'errand'
    rating: number // 1–5
    comment?: string
}

export class ReviewService extends BaseService {
    async submitReview(reviewerId: string, dto: SubmitReviewDto) {
        if (dto.rating < 1 || dto.rating > 5) {
            throw new ValidationError('Rating must be between 1 and 5')
        }

        let revieweeId: string
        let isVerified = false

        if (dto.refType === 'order') {
            const order = await Order.findById(dto.refId)
                .select('buyerId sellerId status')
                .lean()
            if (!order) throw new NotFoundError('Order')

            if (order.status !== ORDER_STATUS.COMPLETED) {
                throw new ForbiddenError(
                    'You can only review after the order is completed',
                )
            }

            // Only the buyer reviews the seller
            if (order.buyerId.toString() !== reviewerId) {
                throw new ForbiddenError(
                    'Only the buyer can leave a review for a service order',
                )
            }

            revieweeId = order.sellerId.toString()
            isVerified = true // confirmed payment = verified review
        } else {
            const errand = await Errand.findById(dto.refId)
                .select('posterId runnerId status')
                .lean()
            if (!errand) throw new NotFoundError('Errand')

            if (errand.status !== ERRAND_STATUS.CONFIRMED) {
                throw new ForbiddenError(
                    'You can only review after the errand is confirmed',
                )
            }

            if (errand.posterId.toString() !== reviewerId) {
                throw new ForbiddenError(
                    'Only the errand poster can leave a review for the runner',
                )
            }
            if (!errand.runnerId) throw new NotFoundError('Runner')

            revieweeId = errand.runnerId.toString()
            isVerified = true
        }

        const existing = await Review.findOne({
            reviewerId: new mongoose.Types.ObjectId(reviewerId),
            refId: new mongoose.Types.ObjectId(dto.refId),
        }).lean()
        if (existing) throw new ConflictError('You have already reviewed this')

        const review = await Review.create({
            reviewerId: new mongoose.Types.ObjectId(reviewerId),
            revieweeId: new mongoose.Types.ObjectId(revieweeId),
            refId: new mongoose.Types.ObjectId(dto.refId),
            refType: dto.refType,
            rating: dto.rating,
            comment: dto.comment?.trim(),
            isVerified,
        })

        await this._updateRatingStats(revieweeId)

        return review
    }

    async getReviews(opts: PaginationOptions = {}) {
        const result = await paginate(
            Review,
            {},
            { ...opts, sort: 'createdAt', order: 'desc' },
            undefined,
            { path: 'reviewerId', select: 'firstName lastName avatar' },
        )

        return {
            ...result,
            data: result.data.map((review: any) => {
                const { firstName, lastName, avatar, _id } =
                    review.reviewerId ?? {}
                return {
                    ...(review.toObject?.() ?? review),
                    reviewerId: {
                        _id,
                        fullName: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
                        avatar,
                    },
                }
            }),
        }
    }
    async getMyReviews(reviewerId: string, opts: PaginationOptions = {}) {
        return paginate(
            Review,
            { reviewerId: new mongoose.Types.ObjectId(reviewerId) },
            { ...opts, sort: 'createdAt', order: 'desc' },
            undefined,
            { path: 'revieweeId', select: 'firstName lastName avatar' },
        )
    }

    private async _updateRatingStats(userId: string): Promise<void> {
        const stats = await Review.aggregate<{
            avgRating: number
            total: number
        }>([
            { $match: { revieweeId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    avgRating: { $avg: '$rating' },
                    total: { $sum: 1 },
                },
            },
        ])

        const avgRating = stats[0]
            ? Math.round(stats[0].avgRating * 10) / 10
            : 0
        const totalReviews = stats[0]?.total ?? 0

        await User.findByIdAndUpdate(userId, {
            averageRating: avgRating,
            totalReviews,
        })
    }
}
