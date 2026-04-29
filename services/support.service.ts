import { BaseService } from './base.service.js'
import SupportTicket, {
    SUPPORT_TYPES,
    SUPPORT_CATEGORIES,
    SUPPORT_CATEGORY_LABELS,
    SUPPORT_TYPE_LABELS,
    SUPPORT_DESCRIPTION_TEMPLATES,
    TICKET_STATUS,
    TICKET_PRIORITY,
} from '../models/support.model.js'
import { NotificationService } from './notification.service.js'
import { NOTIFICATION_TYPE } from '../utils/constant.js'
import { emailQueue } from '../utils/queue.js'
import {
    NotFoundError,
    ValidationError,
    ForbiddenError,
} from '../utils/appError.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import mongoose from 'mongoose'

const notificationService = new NotificationService()

// ─── Auto-assign priority based on category/type ─────────────────────────────

function resolvePriority(category: string, type: string): string {
    const urgent = [
        'suspended_account',
        'payment_failed',
        'withdrawal_issue',
        'wrong_charge',
    ]
    const high = [
        'refund_request',
        'order_refund_request',
        'runner_no_show',
        'seller_unresponsive',
        'errand_dispute_issue',
    ]

    if (urgent.includes(type)) return TICKET_PRIORITY.URGENT
    if (high.includes(type)) return TICKET_PRIORITY.HIGH
    if (category === 'payment' || category === 'errand' || category === 'order')
        return TICKET_PRIORITY.MEDIUM
    return TICKET_PRIORITY.LOW
}

export class SupportService extends BaseService {
    // ── Get categories + types for frontend step 1 & 2 ───────────────────────
    getCategories() {
        return Object.entries(SUPPORT_CATEGORY_LABELS).map(
            ([value, label]) => ({
                value,
                label,
                types: (SUPPORT_TYPES[value] ?? []).map((t) => ({
                    value: t,
                    label: SUPPORT_TYPE_LABELS[t] ?? t,
                    descriptionTemplate: SUPPORT_DESCRIPTION_TEMPLATES[t] ?? '',
                })),
            }),
        )
    }

    // ── Submit a new ticket ───────────────────────────────────────────────────
    async submitTicket(
        userId: string,
        category: string,
        type: string,
        description: string,
        relatedId?: string,
    ) {
        // Validate category
        if (!Object.values(SUPPORT_CATEGORIES).includes(category as any)) {
            throw new ValidationError('Invalid support category')
        }

        // Validate type belongs to category
        const validTypes = SUPPORT_TYPES[category] as readonly string[]
        if (!validTypes?.includes(type)) {
            throw new ValidationError(
                `Invalid issue type for category "${category}"`,
            )
        }

        // support.service.ts — inside submitTicket(), after type validation and before SupportTicket.create()

        if (relatedId) {
            // Must be a valid ObjectId format
            if (!mongoose.Types.ObjectId.isValid(relatedId)) {
                throw new ValidationError('Invalid relatedId format')
            }

            // Must actually belong to this user
            const uid = new mongoose.Types.ObjectId(userId)
            const rid = new mongoose.Types.ObjectId(relatedId)

            const [errand, order] = await Promise.all([
                mongoose.model('Errand').exists({
                    _id: rid,
                    $or: [{ posterId: uid }, { runnerId: uid }],
                }),
                mongoose.model('Order').exists({
                    _id: rid,
                    $or: [{ buyerId: uid }, { sellerId: uid }],
                }),
            ])

            if (!errand && !order) {
                throw new ValidationError(
                    'relatedId does not match any errand or order belonging to your account',
                )
            }
        }
        // Description length
        if (description.trim().length < 20) {
            throw new ValidationError(
                'Description must be at least 20 characters',
            )
        }

        const priority = resolvePriority(category, type)

        const ticket = await SupportTicket.create({
            userId: new mongoose.Types.ObjectId(userId),
            category,
            type,
            description: description.trim(),
            priority,
            relatedId,
        })

        // ── In-app notification to user ───────────────────────────────────────
        await notificationService.create({
            userId,
            type: NOTIFICATION_TYPE.SYSTEM,
            title: 'Support ticket submitted',
            body: `Your ticket #${ticket.ticketNumber} has been received. We'll get back to you shortly.`,
            data: {
                ticketId: ticket._id.toString(),
                ticketNumber: ticket.ticketNumber,
                category,
                type,
            },
        })

        // ── Email confirmation to user ─────────────────────────────────────────
        await emailQueue.add('support-ticket-created', {
            userId,
            ticketNumber: ticket.ticketNumber,
            category: SUPPORT_CATEGORY_LABELS[category] ?? category,
            type: SUPPORT_TYPE_LABELS[type] ?? type,
            description: description.trim(),
            priority,
        })

        return ticket
    }

    // ── Get user's ticket history ─────────────────────────────────────────────
    async getMyTickets(userId: string, opts: PaginationOptions = {}) {
        return paginate(
            SupportTicket,
            { userId: new mongoose.Types.ObjectId(userId) },
            { ...opts, sort: 'createdAt', order: 'desc' },
            'ticketNumber category type status priority adminNote createdAt updatedAt resolvedAt',
        )
    }

    // ── Get single ticket (user must own it) ──────────────────────────────────
    async getTicket(ticketId: string, userId: string) {
        const ticket = await SupportTicket.findById(ticketId).lean()
        if (!ticket) throw new NotFoundError('Support ticket')
        if (ticket.userId.toString() !== userId) {
            throw new ForbiddenError('You do not have access to this ticket')
        }
        return ticket
    }

    async adminGetTicket(ticketId: string) {
        const ticket = await SupportTicket.findById(ticketId)
            .populate('userId', 'firstName lastName email role')
            .populate('resolvedBy', 'firstName lastName email')
            .lean()
        if (!ticket) throw new NotFoundError('Support ticket')
        return ticket
    }
    // ── Admin: list all tickets ───────────────────────────────────────────────
    async adminListTickets(
        opts: PaginationOptions & {
            status?: string
            priority?: string
            category?: string
        } = {},
    ) {
        const filter: Record<string, unknown> = {}
        if (opts.status) filter.status = opts.status
        if (opts.priority) filter.priority = opts.priority
        if (opts.category) filter.category = opts.category

        return paginate(
            SupportTicket,
            filter,
            { ...opts, sort: 'createdAt', order: 'asc' }, // oldest first for support queue
            undefined,
            [{ path: 'userId', select: 'firstName lastName email role' }],
        )
    }

    // ── Admin: update ticket status + note ────────────────────────────────────
    async adminUpdateTicket(
        ticketId: string,
        adminId: string,
        status: string,
        adminNote?: string,
        priority?: string,
    ) {
        const validStatuses = Object.values(TICKET_STATUS)
        if (!validStatuses.includes(status as any)) {
            throw new ValidationError('Invalid ticket status')
        }

        const update: Record<string, unknown> = { status }
        if (adminNote) update.adminNote = adminNote.trim()
        if (priority) update.priority = priority

        if (
            status === TICKET_STATUS.RESOLVED ||
            status === TICKET_STATUS.CLOSED
        ) {
            update.resolvedBy = new mongoose.Types.ObjectId(adminId)
            update.resolvedAt = new Date()
        }

        const ticket = await SupportTicket.findByIdAndUpdate(
            ticketId,
            { $set: update },
            { new: true },
        ).populate('userId', 'firstName lastName email')

        if (!ticket) throw new NotFoundError('Support ticket')

        const user = ticket.userId as any

        // ── Notify user of status change ──────────────────────────────────────
        const statusMessages: Record<string, string> = {
            in_review: `Your ticket #${ticket.ticketNumber} is now being reviewed by our team.`,
            resolved: `Your ticket #${ticket.ticketNumber} has been resolved.${adminNote ? ` Note: ${adminNote}` : ''}`,
            closed: `Your ticket #${ticket.ticketNumber} has been closed.`,
        }

        if (statusMessages[status]) {
            await notificationService.create({
                userId: user._id.toString(),
                type: NOTIFICATION_TYPE.SYSTEM,
                title: `Ticket #${ticket.ticketNumber} update`,
                body: statusMessages[status],
                data: {
                    ticketId: ticket._id.toString(),
                    ticketNumber: ticket.ticketNumber,
                    status,
                    adminNote: adminNote ?? null,
                },
            })

            // ── Email notification to user ────────────────────────────────────
            await emailQueue.add('support-ticket-updated', {
                userId: user._id.toString(),
                ticketNumber: ticket.ticketNumber,
                ticketId: ticket._id.toString(),
                status,
                adminNote: adminNote ?? '',
                category:
                    SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category,
                type: SUPPORT_TYPE_LABELS[ticket.type] ?? ticket.type,
            })
        }

        return ticket
    }
}
