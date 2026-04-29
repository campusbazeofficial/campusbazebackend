import type { Server as SocketIOServer, Socket } from 'socket.io'
import mongoose from 'mongoose'
import Message from '../../models/message.model.js'
import Order from '../../models/order.model.js'
import Errand from '../../models/errand.model.js'
import User from '../../models/user.model.js'
import { uploadToCloudinary } from '../../middlewares/upload.js'
import { NotificationService } from '../../services/notification.service.js'
import { NOTIFICATION_TYPE } from '../../utils/constant.js'

export interface AuthSocket extends Socket {
    userId: string
}

const notificationService = new NotificationService()

// ─── In-memory presence map ───────────────────────────────────────────────────
// userId → Set of socketIds (one user may have multiple tabs/devices)
const onlineUsers = new Map<string, Set<string>>()

function markOnline(userId: string, socketId: string): void {
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set())
    onlineUsers.get(userId)!.add(socketId)
}

function markOffline(userId: string, socketId: string): void {
    const sockets = onlineUsers.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) onlineUsers.delete(userId)
}

export function isUserOnline(userId: string): boolean {
    const sockets = onlineUsers.get(userId)
    return !!(sockets && sockets.size > 0)
}

// ─── Room lock thresholds ─────────────────────────────────────────────────────
// Orders  : completed + cancelled → read-only (disputed stays open for comms)
// Errands : confirmed + cancelled → read-only (completed stays open — poster
//           hasn't confirmed yet and may still need to communicate)
const LOCKED_ORDER_STATUSES  = ['completed', 'cancelled'] as const
const LOCKED_ERRAND_STATUSES = ['confirmed', 'cancelled'] as const

// ─── Room participant resolution ──────────────────────────────────────────────

interface RoomParticipants {
    allowed:     boolean
    isLocked:    boolean  // true → read-only, writes rejected
    otherParty?: string   // userId of the other participant
    title?:      string   // errand title or "your order"
}

async function resolveRoom(
    roomId: string,
    userId: string,
): Promise<RoomParticipants> {
    const [type, id] = roomId.split(':')
    if (!type || !id) return { allowed: false, isLocked: false }

    if (type === 'order') {
        const order = await Order.findById(id)
            .select('buyerId sellerId status')
            .lean()
        if (!order) return { allowed: false, isLocked: false }

        const isBuyer  = order.buyerId.toString()  === userId
        const isSeller = order.sellerId.toString() === userId
        if (!isBuyer && !isSeller) return { allowed: false, isLocked: false }

        return {
            allowed:    true,
            isLocked:   (LOCKED_ORDER_STATUSES as readonly string[]).includes(order.status),
            otherParty: isBuyer
                ? order.sellerId.toString()
                : order.buyerId.toString(),
            title: 'your order',
        }
    }

    if (type === 'errand') {
        const errand = await Errand.findById(id)
            .select('posterId runnerId title status')
            .lean()
        if (!errand) return { allowed: false, isLocked: false }

        const isPoster = errand.posterId.toString()  === userId
        const isRunner = errand.runnerId?.toString() === userId
        if (!isPoster && !isRunner) return { allowed: false, isLocked: false }

        return {
            allowed:    true,
            isLocked:   (LOCKED_ERRAND_STATUSES as readonly string[]).includes(errand.status),
            otherParty: isPoster
                ? errand.runnerId?.toString()
                : errand.posterId.toString(),
            title: `"${errand.title}"`,
        }
    }

    return { allowed: false, isLocked: false }
}

// ─── Auto-join all active rooms for a user ────────────────────────────────────
// Called on connect — user is placed in every room they participate in
// so they receive real-time messages without explicitly joining each room.
async function autoJoinRooms(socket: AuthSocket): Promise<void> {
    const uid = new mongoose.Types.ObjectId(socket.userId)

    const [orders, errands] = await Promise.all([
        Order.find({
            $or: [{ buyerId: uid }, { sellerId: uid }],
            status: { $nin: ['pending_payment', 'cancelled'] },
        })
            .select('_id')
            .lean(),

        Errand.find({
            $or: [{ posterId: uid }, { runnerId: uid }],
            runnerId: { $exists: true },
            status: { $nin: ['posted', 'cancelled'] },
        })
            .select('_id')
            .lean(),
    ])

    const roomIds = [
        ...orders.map((o) => `order:${o._id.toString()}`),
        ...errands.map((e) => `errand:${e._id.toString()}`),
    ]

    for (const roomId of roomIds) {
        socket.join(roomId)
    }
}

// ─── Deliver pending messages to a user who just came online ─────────────────
// Any "sent" messages addressed to this user that arrived while they were
// offline are now marked "delivered" and the sender is notified.
async function deliverPendingMessages(
    io: SocketIOServer,
    socket: AuthSocket,
): Promise<void> {
    const uid = new mongoose.Types.ObjectId(socket.userId)

    // Scope to rooms the socket actually joined via autoJoinRooms
    const roomIds = [...socket.rooms].filter(
        (r) => r.startsWith('order:') || r.startsWith('errand:'),
    )
    if (roomIds.length === 0) return

    const pending = await Message.find({
        roomId:         { $in: roomIds },
        senderId:       { $ne: uid },
        deliveryStatus: 'sent',
        isDeleted:      false,
    }).lean()

    if (pending.length === 0) return

    const now = new Date()
    const ids = pending.map((m) => m._id)

    await Message.updateMany(
        { _id: { $in: ids } },
        { deliveryStatus: 'delivered', deliveredAt: now },
    )

    // Group by senderId so we batch notifications per sender
    const bySender = new Map<string, string[]>()
    for (const msg of pending) {
        const sid = msg.senderId.toString()
        if (!bySender.has(sid)) bySender.set(sid, [])
        bySender.get(sid)!.push(msg._id.toString())
    }

    for (const [senderId, messageIds] of bySender) {
        io.to(`user:${senderId}`).emit('chat:delivered', {
            messageIds,
            deliveredTo: uid,
            deliveredAt: now,
        })
    }
}

// ─── Register all chat/notification events for one socket ────────────────────
export async function registerChatHandlers(
    io: SocketIOServer,
    socket: AuthSocket,
): Promise<void> {
    const userId = socket.userId

    // Declared here so both `disconnecting` handler and `disconnect` handler
    // share the same snapshot — socket.rooms is empty by the time 'disconnect' fires
    let roomsSnapshot: string[] = []

    // Per-socket typing timers — key: `${userId}:${roomId}`
    // Cleared automatically after 5 s of inactivity or on disconnect
    const typingTimers = new Map<string, NodeJS.Timeout>()

    // ── 1. Presence: mark online, broadcast to rooms ─────────────────────────
    markOnline(userId, socket.id)

    // Auto-join all active rooms before broadcasting presence
    await autoJoinRooms(socket).catch(() => null)

    // Broadcast to all rooms this socket is in (excluding personal notification room)
    for (const roomId of socket.rooms) {
        if (roomId !== socket.id && roomId !== `user:${userId}`) {
            socket.to(roomId).emit('chat:presence', {
                userId,
                isOnline: true,
                lastSeen: null,
            })
        }
    }

    // Deliver any messages that arrived while user was offline
    // Must run AFTER autoJoinRooms so socket.rooms is populated
    await deliverPendingMessages(io, socket).catch(() => null)

    // ── 2. Explicit room join (client can still call this for late-bound rooms) ──
    socket.on('chat:join', async (roomId: string) => {
        if (typeof roomId !== 'string') return

        let room: Awaited<ReturnType<typeof resolveRoom>>
        try {
            room = await resolveRoom(roomId, userId)
        } catch (err) {
            console.error(
                `[chat:join] resolveRoom error for room="${roomId}" user="${userId}":`,
                err,
            )
            socket.emit('chat:error', { message: 'Failed to join room' })
            return
        }

        if (!room.allowed) {
            console.warn(
                `[chat:join] Not allowed — room="${roomId}" userId="${userId}"`,
            )
            socket.emit('chat:error', {
                message: 'You are not a participant in this conversation',
            })
            return
        }

        socket.join(roomId)
        // Tell the client whether the room is read-only so it can hide the input
        socket.emit('chat:joined', { roomId, isLocked: room.isLocked })
    })

    // ── 3. Send message ───────────────────────────────────────────────────────
    socket.on(
        'chat:send',
        async (payload: {
            roomId: string
            content: string
            replyToId?: string
            attachmentBuffer?: string // base64, max 1 MB
            attachmentMime?: string
        }) => {
            try {
                if (
                    typeof payload?.roomId !== 'string' ||
                    typeof payload?.content !== 'string'
                )
                    return
                if (
                    payload.content.trim().length === 0 ||
                    payload.content.length > 4000
                )
                    return

                const room = await resolveRoom(payload.roomId, userId)
                if (!room.allowed) {
                    socket.emit('chat:error', { message: 'Access denied' })
                    return
                }

                // ── Lock check ────────────────────────────────────────────────
                if (room.isLocked) {
                    socket.emit('chat:error', {
                        message: 'This conversation is closed and no longer accepts new messages',
                        code:    'ROOM_LOCKED',
                    })
                    return
                }

                const [roomType] = payload.roomId.split(':') as [
                    'order' | 'errand',
                    string,
                ]

                let attachmentUrl: string | undefined
                let attachmentPublicId: string | undefined

                if (payload.attachmentBuffer && payload.attachmentMime) {
                    const buffer = Buffer.from(
                        payload.attachmentBuffer,
                        'base64',
                    )
                    if (buffer.length <= 1_048_576) {
                        const resourceType =
                            payload.attachmentMime === 'application/pdf'
                                ? 'raw'
                                : 'image'
                        const result = await uploadToCloudinary(
                            buffer,
                            `campusbaze/chat/${payload.roomId}`,
                            resourceType,
                        )
                        attachmentUrl = result.secure_url
                        attachmentPublicId = result.public_id
                    }
                }

                // Determine initial delivery status
                // If other party is currently online → "delivered", else "sent"
                const otherOnline = room.otherParty
                    ? isUserOnline(room.otherParty)
                    : false
                const initialStatus = otherOnline ? 'delivered' : 'sent'
                const deliveredAt   = otherOnline ? new Date() : undefined

                const message = await Message.create({
                    roomId: payload.roomId,
                    roomType,
                    senderId: new mongoose.Types.ObjectId(userId),
                    content: payload.content.trim(),
                    attachmentUrl,
                    attachmentPublicId,
                    deliveryStatus: initialStatus,
                    deliveredAt,
                    replyToId: payload.replyToId
                        ? new mongoose.Types.ObjectId(payload.replyToId)
                        : undefined,
                })

                const outgoing = {
                    id:             message._id,
                    roomId:         message.roomId,
                    senderId:       message.senderId,
                    content:        message.content,
                    attachmentUrl:  message.attachmentUrl ?? null,
                    replyToId:      message.replyToId ?? null,
                    deliveryStatus: message.deliveryStatus,
                    deliveredAt:    message.deliveredAt ?? null,
                    readAt:         null,
                    isEdited:       false,
                    isDeleted:      false,
                    createdAt:      message.createdAt,
                }

                // Broadcast to all room members (other tabs of same user + other party)
                socket.to(payload.roomId).emit('chat:message', outgoing)

                // Acknowledge to sender with final delivery status
                socket.emit('chat:message:sent', {
                    id:             message._id,
                    deliveryStatus: message.deliveryStatus,
                    deliveredAt:    message.deliveredAt ?? null,
                    createdAt:      message.createdAt,
                })

                // If already delivered, notify sender immediately
                if (otherOnline && room.otherParty) {
                    socket.emit('chat:delivered', {
                        messageIds:  [message._id.toString()],
                        deliveredTo: room.otherParty,
                        deliveredAt: message.deliveredAt,
                    })
                }

                // Emit unread count update to the other party
                if (room.otherParty) {
                    const unread = await Message.countDocuments({
                        roomId:   payload.roomId,
                        senderId: { $ne: new mongoose.Types.ObjectId(room.otherParty) },
                        deliveryStatus: { $ne: 'read' },
                        isDeleted: false,
                    })
                    io.to(`user:${room.otherParty}`).emit('chat:unread:update', {
                        roomId:      payload.roomId,
                        unreadCount: unread,
                    })
                }

                // In-app push notification only if other party is offline
                if (!otherOnline && room.otherParty) {
                    notificationService
                        .create({
                            userId: room.otherParty,
                            type:   NOTIFICATION_TYPE.NEW_MESSAGE,
                            title:  'New message',
                            body:   `You have a new message regarding ${room.title}.`,
                            data:   { roomId: payload.roomId },
                        })
                        .catch(() => null)
                }
            } catch {
                socket.emit('chat:error', { message: 'Failed to send message' })
            }
        },
    )

    // ── 4. Mark messages as read ──────────────────────────────────────────────
    // Read is always allowed even on locked rooms — history must remain accessible
    socket.on('chat:read', async (roomId: string) => {
        if (typeof roomId !== 'string') return

        const room = await resolveRoom(roomId, userId).catch(() => ({
            allowed:  false,
            isLocked: false,
            otherParty: undefined,
        }))
        if (!room.allowed) return

        const now = new Date()

        await Message.updateMany(
            {
                roomId,
                senderId:       { $ne: new mongoose.Types.ObjectId(userId) },
                deliveryStatus: { $ne: 'read' },
                isDeleted:      false,
            },
            { deliveryStatus: 'read', readAt: now },
        ).catch(() => null)

        // Notify the sender(s) their messages were read
        socket.to(roomId).emit('chat:read:ack', { roomId, readBy: userId, readAt: now })

        // Reset unread count for this user in this room
        io.to(`user:${userId}`).emit('chat:unread:update', {
            roomId,
            unreadCount: 0,
        })
    })

    // ── 5. Chat history (cursor-based) ────────────────────────────────────────
    // Read is always allowed even on locked rooms
    socket.on(
        'chat:history',
        async (payload: {
            roomId: string
            before?: string
            limit?:  number
        }) => {
            if (typeof payload?.roomId !== 'string') return

            const { allowed } = await resolveRoom(payload.roomId, userId).catch(
                () => ({ allowed: false, isLocked: false }),
            )
            if (!allowed) {
                socket.emit('chat:error', { message: 'Access denied' })
                return
            }

            const limit  = Math.min(payload.limit ?? 30, 50)
            const filter: Record<string, unknown> = { roomId: payload.roomId }

            if (payload.before) {
                if (!mongoose.Types.ObjectId.isValid(payload.before)) {
                    socket.emit('chat:error', { message: 'Invalid cursor' })
                    return
                }
                filter._id = { $lt: new mongoose.Types.ObjectId(payload.before) }
            }

            const messages = await Message.find(filter)
                .sort({ _id: -1 })
                .limit(limit)
                .select('-attachmentPublicId')
                .lean()
                .catch(() => [])

            socket.emit('chat:history', {
                roomId:     payload.roomId,
                messages:   messages.reverse(),
                hasMore:    messages.length === limit,
                nextCursor: messages.length > 0 ? messages[0]._id.toString() : null,
            })
        },
    )

    // ── 6. Edit message ───────────────────────────────────────────────────────
    socket.on(
        'chat:edited',
        async (payload: { messageId: string; content: string }) => {
            if (
                typeof payload?.messageId !== 'string' ||
                typeof payload?.content !== 'string'
            )
                return
            if (
                payload.content.trim().length === 0 ||
                payload.content.length > 4000
            )
                return

            const message = await Message.findById(payload.messageId).catch(() => null)
            if (!message) return
            if (message.senderId.toString() !== userId) {
                socket.emit('chat:error', { message: 'You can only edit your own messages' })
                return
            }
            if (message.isDeleted) return

            // ── Lock check ────────────────────────────────────────────────────
            const room = await resolveRoom(message.roomId, userId).catch(
                () => ({ allowed: false, isLocked: true }),
            )
            if (room.isLocked) {
                socket.emit('chat:error', {
                    message: 'This conversation is closed',
                    code:    'ROOM_LOCKED',
                })
                return
            }

            message.content  = payload.content.trim()
            message.isEdited = true
            message.editedAt = new Date()
            await message.save()

            const update = {
                id:       message._id,
                roomId:   message.roomId,
                content:  message.content,
                isEdited: true,
                editedAt: message.editedAt,
            }

            socket.to(message.roomId).emit('chat:edited', update)
            socket.emit('chat:edited:ack', update)
        },
    )

    // ── 7. Delete message (soft delete) ──────────────────────────────────────
    socket.on('chat:deleted', async (messageId: string) => {
        if (typeof messageId !== 'string') return

        const message = await Message.findById(messageId).catch(() => null)
        if (!message) return
        if (message.senderId.toString() !== userId) {
            socket.emit('chat:error', { message: 'You can only delete your own messages' })
            return
        }
        if (message.isDeleted) return

        // ── Lock check ────────────────────────────────────────────────────────
        const room = await resolveRoom(message.roomId, userId).catch(
            () => ({ allowed: false, isLocked: true }),
        )
        if (room.isLocked) {
            socket.emit('chat:error', {
                message: 'This conversation is closed',
                code:    'ROOM_LOCKED',
            })
            return
        }

        message.isDeleted = true
        message.deletedAt = new Date()
        message.content   = 'This message was deleted'
        await message.save()

        const update = {
            id:        message._id,
            roomId:    message.roomId,
            isDeleted: true,
        }
        socket.to(message.roomId).emit('chat:deleted', update)
        socket.emit('chat:deleted:ack', update)
    })

    // ── 8. Presence query ─────────────────────────────────────────────────────
    socket.on('chat:presence', async (targetUserId: string) => {
        if (typeof targetUserId !== 'string') return

        const online = isUserOnline(targetUserId)
        let lastSeen: Date | null = null

        if (!online) {
            const user = await User.findById(targetUserId)
                .select('lastSeen')
                .lean()
                .catch(() => null)
            lastSeen = user?.lastSeen ?? null
        }

        socket.emit('chat:presence', {
            userId:   targetUserId,
            isOnline: online,
            lastSeen,
        })
    })

    // ── 9. Typing indicators ──────────────────────────────────────────────────
    // Auth-gated + server-side 5 s auto-clear to handle connection drops
    socket.on('typing:start', async (roomId: string) => {
        if (typeof roomId !== 'string') return
        const { allowed } = await resolveRoom(roomId, userId).catch(
            () => ({ allowed: false, isLocked: false }),
        )
        if (!allowed) return

        const key      = `${userId}:${roomId}`
        const existing = typingTimers.get(key)
        if (existing) clearTimeout(existing)

        socket.to(roomId).emit('typing:start', { roomId, userId })

        // Auto-stop after 5 s of silence — covers abrupt disconnects
        typingTimers.set(key, setTimeout(() => {
            socket.to(roomId).emit('typing:stop', { roomId, userId })
            typingTimers.delete(key)
        }, 5000))
    })

    socket.on('typing:stop', async (roomId: string) => {
        if (typeof roomId !== 'string') return
        const { allowed } = await resolveRoom(roomId, userId).catch(
            () => ({ allowed: false, isLocked: false }),
        )
        if (!allowed) return

        const key      = `${userId}:${roomId}`
        const existing = typingTimers.get(key)
        if (existing) {
            clearTimeout(existing)
            typingTimers.delete(key)
        }

        socket.to(roomId).emit('typing:stop', { roomId, userId })
    })

    // ── 10. Disconnecting + Disconnect ────────────────────────────────────────
    // 'disconnecting' fires BEFORE socket.rooms is cleared — snapshot it here.
    // Both the typing cleanup and the offline presence broadcast use this snapshot.
    socket.on('disconnecting', () => {
        roomsSnapshot = [...socket.rooms].filter(
            (r) => r !== socket.id && r !== `user:${userId}`,
        )

        // Clear any dangling typing timers so the other party isn't stuck
        // seeing "typing..." after this socket disappears
        for (const roomId of roomsSnapshot) {
            const key   = `${userId}:${roomId}`
            const timer = typingTimers.get(key)
            if (timer) {
                clearTimeout(timer)
                typingTimers.delete(key)
                // Emit stop so the other party's UI clears immediately
                socket.to(roomId).emit('typing:stop', { roomId, userId })
            }
        }
    })

    socket.on('disconnect', async () => {
        markOffline(userId, socket.id)

        const stillOnline = isUserOnline(userId)
        if (!stillOnline) {
            const now = new Date()

            await User.findByIdAndUpdate(userId, { lastSeen: now }).catch(() => null)

            // Use the snapshot — socket.rooms is already empty here
            for (const roomId of roomsSnapshot) {
                io.to(roomId).emit('chat:presence', {
                    userId,
                    isOnline: false,
                    lastSeen: now,
                })
            }
        }
    })
}