import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Notification from '../models/notification.model.js'
import { type NotificationType } from '../utils/constant.js'
import { emitToUser } from '../utils/socketHelper.js'

interface CreateNotificationDto {
    userId: string | mongoose.Types.ObjectId
    type: NotificationType
    title: string
    body: string
    data?: Record<string, unknown>
}

export class NotificationService extends BaseService {
    // ── Create and push to socket ─────────────────────────────────────────────
    async create(dto: CreateNotificationDto): Promise<void> {
        const uid =
            typeof dto.userId === 'string'
                ? new mongoose.Types.ObjectId(dto.userId)
                : dto.userId

        const notification = await Notification.create({
            userId: uid,
            type: dto.type,
            title: dto.title,
            body: dto.body,
            data: dto.data,
        })

        // Push to connected socket client — non-blocking, no-throw
        try {
            emitToUser(uid.toString(), 'notification:new', {
                id: notification._id,
                slug: notification.slug,
                type: notification.type,
                title: notification.title,
                body: notification.body,
                data: notification.data,
                createdAt: notification.createdAt,
            })
        } catch {
            // User may be offline — notification is persisted in DB for later fetch
        }
    }

    async list(userId: string, page = 1, limit = 20) {
        const uid = new mongoose.Types.ObjectId(userId)
        const skip = (page - 1) * limit

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find({ userId: uid })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean({ virtuals: true }),
            Notification.countDocuments({ userId: uid }),
            Notification.countDocuments({ userId: uid, isRead: false }),
        ])

        return {
            notifications,
            unreadCount,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        }
    }

    // ── Mark single notification read ─────────────────────────────────────────
    async markRead(notificationId: string, userId: string): Promise<void> {
        await Notification.findOneAndUpdate(
            {
                _id: notificationId,
                userId: new mongoose.Types.ObjectId(userId),
            },
            { isRead: true },
        )
    }

    // ── Mark all read ─────────────────────────────────────────────────────────
    async markAllRead(userId: string): Promise<void> {
        await Notification.updateMany(
            { userId: new mongoose.Types.ObjectId(userId), isRead: false },
            { isRead: true },
        )
    }

    // ── Delete a notification ─────────────────────────────────────────────────
    async deleteOne(notificationId: string, userId: string): Promise<void> {
        await Notification.findOneAndDelete({
            _id: notificationId,
            userId: new mongoose.Types.ObjectId(userId),
        })
    }

    // ── Fetch single notification ─────────────────────────────────────────────
    async getOne(notificationId: string, userId: string) {
        const notification = await Notification.findOne({
            _id: notificationId,
            userId: new mongoose.Types.ObjectId(userId),
        }).lean({ virtuals: true })

        if (!notification) return null // let the controller decide the 404

        return notification
    }
}
