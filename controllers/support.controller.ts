import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { validate } from '../middlewares/validate.js'
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js'
import { parsePaginationQuery } from '../utils/paginate.js'
import { SupportService } from '../services/support.service.js'
import {
    SUPPORT_CATEGORIES,
    TICKET_STATUS,
    TICKET_PRIORITY,
} from '../models/support.model.js'

const supportService = new SupportService()

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const submitTicketSchema = z.object({
    category: z.enum(
        Object.values(SUPPORT_CATEGORIES) as [string, ...string[]],
    ),
    type: z.string().min(1, 'Issue type is required'),
    description: z
        .string()
        .min(20, 'Description must be at least 20 characters')
        .max(2000),
    relatedId: z.string().optional(), // optional errand/order ID
})

export const adminUpdateTicketSchema = z.object({
    status: z.enum(Object.values(TICKET_STATUS) as [string, ...string[]]),
    adminNote: z.string().max(1000).optional(),
    priority: z
        .enum(Object.values(TICKET_PRIORITY) as [string, ...string[]])
        .optional(),
})

export const validateSubmitTicket = validate(submitTicketSchema)
export const validateAdminUpdateTicket = validate(adminUpdateTicketSchema)

// ─── User controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/support/categories
 * Returns all categories + types + templates for the 3-step form
 */
export const getCategories = async (
    _req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const categories = supportService.getCategories()
        sendSuccess(res, { categories })
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/v1/support
 * Submit a new support ticket
 */
export const submitTicket = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { category, type, description, relatedId } = req.body as z.infer<
            typeof submitTicketSchema
        >

        const ticket = await supportService.submitTicket(
            req.user!._id.toString(),
            category,
            type,
            description,
            relatedId,
        )

        sendCreated(res, {
            message: `Ticket #${ticket.ticketNumber} submitted successfully. We'll be in touch soon.`,
            ticketNumber: ticket.ticketNumber,
            ticketId: ticket._id,
            status: ticket.status,
            priority: ticket.priority,
        })
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/v1/support
 * Get current user's ticket history
 */
export const getMyTickets = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await supportService.getMyTickets(
            req.user!._id.toString(),
            opts,
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/v1/support/:ticketId
 * Get a single ticket (user must own it)
 */
export const getTicket = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const ticket = await supportService.getTicket(
            req.params.ticketId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { ticket })
    } catch (err) {
        next(err)
    }
}

// ─── Admin controllers ────────────────────────────────────────────────────────

export const adminGetTicket = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const ticket = await supportService.adminGetTicket(
            req.params.ticketId as string,
        )
        sendSuccess(res, { ticket })
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/v1/admin/support
 * List all tickets with filters
 */
export const adminListTickets = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await supportService.adminListTickets({
            ...opts,
            status: req.query.status as string | undefined,
            priority: req.query.priority as string | undefined,
            category: req.query.category as string | undefined,
        })
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

/**
 * PATCH /api/v1/admin/support/:ticketId
 * Update ticket status, add admin note, change priority
 */
export const adminUpdateTicket = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { status, adminNote, priority } = req.body as z.infer<
            typeof adminUpdateTicketSchema
        >

        const ticket = await supportService.adminUpdateTicket(
            req.params.ticketId as string,
            req.user!._id.toString(),
            status,
            adminNote,
            priority,
        )

        sendSuccess(res, {
            message: `Ticket #${ticket.ticketNumber} updated to "${status}"`,
            ticket,
        })
    } catch (err) {
        next(err)
    }
}
