import { Router } from 'express'
import { authenticate, authorize } from '../middlewares/auth.js'
import {
    getCategories,
    submitTicket,
    getMyTickets,
    getTicket,
    adminListTickets,
    adminUpdateTicket,
    validateSubmitTicket,
    validateAdminUpdateTicket,
} from '../controllers/support.controller.js'

const router = Router()

// ─── Public (authenticated users) ─────────────────────────────────────────────

// GET  /api/v1/support/categories  — step 1 & 2 form data (categories + types + templates)
router.get('/categories', authenticate, getCategories)

// GET  /api/v1/support             — user's ticket history
router.get('/', authenticate, getMyTickets)

// GET  /api/v1/support/:ticketId   — single ticket detail
router.get('/:ticketId', authenticate, getTicket)

// POST /api/v1/support             — submit new ticket
router.post('/', authenticate, validateSubmitTicket, submitTicket)

export default router

