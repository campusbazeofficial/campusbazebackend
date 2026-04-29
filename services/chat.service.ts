import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Message from '../models/message.model.js'
import Order from '../models/order.model.js'
import Errand from '../models/errand.model.js'
import {
    ForbiddenError,
    NotFoundError,
    BadRequestError,
} from '../utils/appError.js'
import { NotificationService } from './notification.service.js'
import { NOTIFICATION_TYPE } from '../utils/constant.js'
import { isUserOnline } from '../sockets/handlers/notificationHandler.js'
import { emitToUser } from '../utils/socketHelper.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomType = 'order' | 'errand'

export interface RoomSummary {
    roomId: string
    roomType: RoomType
    isLocked: boolean // true → read-only, frontend should hide the input
    contextTitle: string
    otherParty: {
        _id: string
        firstName: string
        lastName: string
        avatar?: string | null
    }
    lastMessage: {
        content: string
        senderId: string
        createdAt: Date
    } | null
    unreadCount: number
    updatedAt: Date
}

// ─── Lock thresholds (mirror the socket handler) ──────────────────────────────
// Keep these in sync with notificationHandler.ts or extract to a shared constants file
const LOCKED_ORDER_STATUSES = ['completed', 'cancelled'] as const
const LOCKED_ERRAND_STATUSES = ['confirmed', 'cancelled'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseRoomId(roomId: string): { type: RoomType; id: string } {
    const [type, id] = roomId.split(':')
    if ((type !== 'order' && type !== 'errand') || !id) {
        throw new BadRequestError(
            "Invalid roomId format. Expected 'order:<id>' or 'errand:<id>'",
        )
    }
    return { type: type as RoomType, id }
}

// Replaces both assertParticipant + _resolveOtherParty — single DB query per send.
// Throws on not-found or forbidden; returns otherParty, title, and isLocked.
async function resolveRoomAccess(
    roomId: string,
    userId: string,
): Promise<{ otherParty?: string; title: string; isLocked: boolean }> {
    const { type, id } = parseRoomId(roomId)

    if (type === 'order') {
        const order = await Order.findById(id)
            .select('buyerId sellerId status')
            .lean()
        if (!order) throw new NotFoundError('Order')

        const isBuyer = order.buyerId.toString() === userId
        const isSeller = order.sellerId.toString() === userId
        if (!isBuyer && !isSeller)
            throw new ForbiddenError(
                'You are not a participant in this conversation',
            )

        return {
            otherParty: isBuyer
                ? order.sellerId.toString()
                : order.buyerId.toString(),
            title: 'your order',
            isLocked: (LOCKED_ORDER_STATUSES as readonly string[]).includes(
                order.status,
            ),
        }
    }

    // type === 'errand'
    const errand = await Errand.findById(id)
        .select('posterId runnerId title status')
        .lean()
    if (!errand) throw new NotFoundError('Errand')

    const isPoster = errand.posterId.toString() === userId
    const isRunner = errand.runnerId?.toString() === userId
    if (!isPoster && !isRunner)
        throw new ForbiddenError(
            'You are not a participant in this conversation',
        )

    return {
        otherParty: isPoster
            ? errand.runnerId?.toString()
            : errand.posterId.toString(),
        title: `"${errand.title}"`,
        isLocked: (LOCKED_ERRAND_STATUSES as readonly string[]).includes(
            errand.status,
        ),
    }
}

// Used only by getMessages — read is always allowed regardless of lock status,
// so we only verify participation here, not lock.
async function assertParticipant(
    roomId: string,
    userId: string,
): Promise<void> {
    const { type, id } = parseRoomId(roomId)

    if (type === 'order') {
        const order = await Order.findById(id).select('buyerId sellerId').lean()
        if (!order) throw new NotFoundError('Order')
        const isParticipant =
            order.buyerId.toString() === userId ||
            order.sellerId.toString() === userId
        if (!isParticipant)
            throw new ForbiddenError(
                'You are not a participant in this conversation',
            )
        return
    }

    const errand = await Errand.findById(id).select('posterId runnerId').lean()
    if (!errand) throw new NotFoundError('Errand')
    const isParticipant =
        errand.posterId.toString() === userId ||
        errand.runnerId?.toString() === userId
    if (!isParticipant)
        throw new ForbiddenError(
            'You are not a participant in this conversation',
        )
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ChatService extends BaseService {
    // Read-only — no lock check needed, history is always accessible
    async getMessages(
        roomId: string,
        userId: string,
        before?: string,
        limit = 30,
    ) {
        await assertParticipant(roomId, userId)

        const safeLimit = Math.min(limit, 50)
        const filter: Record<string, unknown> = { roomId }

        if (before) {
            if (!mongoose.Types.ObjectId.isValid(before)) {
                throw new BadRequestError(
                    "Invalid cursor — 'before' must be a valid message ID",
                )
            }
            filter._id = { $lt: new mongoose.Types.ObjectId(before) }
        }

        const messages = await Message.find(filter)
            .sort({ _id: -1 })
            .limit(safeLimit)
            .select('-attachmentPublicId')
            .lean()

        return {
            messages: messages.reverse(),
            hasMore: messages.length === safeLimit,
            nextCursor: messages.length > 0 ? messages[0]._id.toString() : null,
        }
    }

    async getRooms(userId: string): Promise<RoomSummary[]> {
        const uid = new mongoose.Types.ObjectId(userId)

        // Include completed/confirmed/cancelled so users can still read history.
        // Only skip rooms that never had a real chat: pending_payment orders
        // and errands with no runner assigned yet.
        const [orders, errands] = await Promise.all([
            Order.find({
                $or: [{ buyerId: uid }, { sellerId: uid }],
                status: { $nin: ['pending_payment'] },
            })
                .select('buyerId sellerId status updatedAt')
                .populate('listingId', 'title')
                .populate('buyerId', 'firstName lastName avatar')
                .populate('sellerId', 'firstName lastName avatar')
                .lean(),

            Errand.find({
                $or: [{ posterId: uid }, { runnerId: uid }],
                runnerId: { $exists: true }, // no runner = no chat ever happened
                status: { $nin: ['posted'] },
            })
                .select('posterId runnerId title status updatedAt')
                .populate('posterId', 'firstName lastName avatar')
                .populate('runnerId', 'firstName lastName avatar')
                .lean(),
        ])

        const roomIds = [
            ...orders.map((o) => `order:${o._id.toString()}`),
            ...errands.map((e) => `errand:${e._id.toString()}`),
        ]

        if (roomIds.length === 0) return []

        const [lastMessages, unreadCounts] = await Promise.all([
            Message.aggregate<{
                _id: string
                lastMsg: InstanceType<typeof Message>
            }>([
                { $match: { roomId: { $in: roomIds } } },
                { $sort: { createdAt: -1 } },
                { $group: { _id: '$roomId', lastMsg: { $first: '$$ROOT' } } },
            ]),
            Message.aggregate<{ _id: string; count: number }>([
                {
                    $match: {
                        roomId: { $in: roomIds },
                        senderId: { $ne: uid },
                        // ✅ consistent with deliveryStatus used everywhere else
                        deliveryStatus: { $ne: 'read' },
                        isDeleted: false,
                    },
                },
                { $group: { _id: '$roomId', count: { $sum: 1 } } },
            ]),
        ])

        const lastMsgMap = new Map(lastMessages.map((r) => [r._id, r.lastMsg]))
        const unreadMap = new Map(unreadCounts.map((r) => [r._id, r.count]))

        type PopulatedUser = {
            _id: mongoose.Types.ObjectId
            firstName: string
            lastName: string
            avatar?: string
        }

        const rooms: RoomSummary[] = []

        for (const order of orders) {
            const roomId = `order:${order._id.toString()}`
            const isBuyer =
                (order.buyerId as unknown as PopulatedUser)._id.toString() ===
                userId
            const otherUser = isBuyer
                ? (order.sellerId as unknown as PopulatedUser)
                : (order.buyerId as unknown as PopulatedUser)
            const listing = order.listingId as unknown as {
                title: string
            } | null
            const lastMsg = lastMsgMap.get(roomId)

            rooms.push({
                roomId,
                roomType: 'order',
                isLocked: (LOCKED_ORDER_STATUSES as readonly string[]).includes(
                    order.status,
                ),
                contextTitle: listing?.title ?? 'Service Order',
                otherParty: {
                    _id: otherUser._id.toString(),
                    firstName: otherUser.firstName,
                    lastName: otherUser.lastName,
                    avatar: otherUser.avatar ?? null,
                },
                lastMessage: lastMsg
                    ? {
                          content: lastMsg.content,
                          senderId: lastMsg.senderId.toString(),
                          createdAt: lastMsg.createdAt,
                      }
                    : null,
                unreadCount: unreadMap.get(roomId) ?? 0,
                updatedAt: order.updatedAt as Date,
            })
        }

        for (const errand of errands) {
            const roomId = `errand:${errand._id.toString()}`
            const isPoster =
                (errand.posterId as unknown as PopulatedUser)._id.toString() ===
                userId
            const otherUser = isPoster
                ? (errand.runnerId as unknown as PopulatedUser)
                : (errand.posterId as unknown as PopulatedUser)
            const lastMsg = lastMsgMap.get(roomId)

            rooms.push({
                roomId,
                roomType: 'errand',
                isLocked: (
                    LOCKED_ERRAND_STATUSES as readonly string[]
                ).includes(errand.status),
                contextTitle: errand.title as string,
                otherParty: {
                    _id: otherUser._id.toString(),
                    firstName: otherUser.firstName,
                    lastName: otherUser.lastName,
                    avatar: otherUser.avatar ?? null,
                },
                lastMessage: lastMsg
                    ? {
                          content: lastMsg.content,
                          senderId: lastMsg.senderId.toString(),
                          createdAt: lastMsg.createdAt,
                      }
                    : null,
                unreadCount: unreadMap.get(roomId) ?? 0,
                updatedAt: errand.updatedAt as Date,
            })
        }

        return rooms.sort((a, b) => {
            const aTime = a.lastMessage?.createdAt ?? a.updatedAt
            const bTime = b.lastMessage?.createdAt ?? b.updatedAt
            return new Date(bTime).getTime() - new Date(aTime).getTime()
        })
    }

    async sendMessage(
        roomId: string,
        userId: string,
        content: string,
        replyToId?: string,
    ) {
        // resolveRoomAccess replaces the old assertParticipant + _resolveOtherParty
        // pair — single DB query instead of two for the same document
        const { otherParty, title, isLocked } = await resolveRoomAccess(
            roomId,
            userId,
        )

        // ── Lock check ────────────────────────────────────────────────────────
        if (isLocked) {
            throw new ForbiddenError(
                'This conversation is closed and no longer accepts new messages',
            )
        }

        if (!content.trim() || content.length > 4000) {
            throw new BadRequestError(
                'Message content must be between 1 and 4000 characters',
            )
        }

        const [roomType] = roomId.split(':') as ['order' | 'errand', string]

        const otherOnline = otherParty ? isUserOnline(otherParty) : false
        const initialStatus = otherOnline ? 'delivered' : 'sent'
        const deliveredAt = otherOnline ? new Date() : undefined

        const message = await Message.create({
            roomId,
            roomType,
            senderId: new mongoose.Types.ObjectId(userId),
            content: content.trim(),
            deliveryStatus: initialStatus,
            deliveredAt,
            replyToId: replyToId
                ? new mongoose.Types.ObjectId(replyToId)
                : undefined,
        })

        const outgoing = {
            id: message._id,
            roomId: message.roomId,
            senderId: message.senderId,
            content: message.content,
            attachmentUrl: null,
            replyToId: message.replyToId ?? null,
            deliveryStatus: message.deliveryStatus,
            deliveredAt: message.deliveredAt ?? null,
            readAt: null,
            isEdited: false,
            isDeleted: false,
            createdAt: message.createdAt,
        }

        // Push to the room via socket so online users get it in real time
        emitToUser(roomId, 'chat:message', outgoing)

        // Unread badge update to other party
        if (otherParty) {
            const unread = await Message.countDocuments({
                roomId,
                senderId: { $ne: new mongoose.Types.ObjectId(otherParty) },
                deliveryStatus: { $ne: 'read' },
                isDeleted: false,
            })
            emitToUser(otherParty, 'chat:unread:update', {
                roomId,
                unreadCount: unread,
            })
        }

        // Push notification only if other party is offline
        if (!otherOnline && otherParty) {
            new NotificationService()
                .create({
                    userId: otherParty,
                    type: NOTIFICATION_TYPE.NEW_MESSAGE,
                    title: 'New message',
                    body: `You have a new message regarding ${title}.`,
                    data: { roomId },
                })
                .catch(() => null)
        }

        return outgoing
    }

    async getTotalUnread(userId: string): Promise<number> {
        const uid = new mongoose.Types.ObjectId(userId)
        const [orders, errands] = await Promise.all([
            Order.find({ $or: [{ buyerId: uid }, { sellerId: uid }] })
                .select('_id')
                .lean(),
            Errand.find({ $or: [{ posterId: uid }, { runnerId: uid }] })
                .select('_id')
                .lean(),
        ])
        const roomIds = [
            ...orders.map((o) => `order:${o._id}`),
            ...errands.map((e) => `errand:${e._id}`),
        ]
        return Message.countDocuments({
            roomId: { $in: roomIds },
            senderId: { $ne: uid },
            deliveryStatus: { $ne: 'read' }, // ✅ consistent with deliveryStatus
            isDeleted: false,
        })
    }

    async markAsRead(roomId: string, userId: string): Promise<void> {
        await assertParticipant(roomId, userId)

        const now = new Date()

        const updated = await Message.updateMany(
            {
                roomId,
                senderId: { $ne: new mongoose.Types.ObjectId(userId) },
                deliveryStatus: { $ne: 'read' },
                isDeleted: false,
            },
            { deliveryStatus: 'read', readAt: now },
        )

        if (updated.modifiedCount === 0) return // nothing changed, skip socket noise

        // Notify senders their messages were read via socket (if they're online)
        emitToUser(roomId, 'chat:read:ack', {
            roomId,
            readBy: userId,
            readAt: now,
        })

        // Reset unread badge for this user
        emitToUser(`user:${userId}`, 'chat:unread:update', {
            roomId,
            unreadCount: 0,
        })
    }
}
