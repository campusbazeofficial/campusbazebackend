import { Router } from 'express'
import { authenticate, authorize } from '../middlewares/auth.js'
import {
    getCategories,
    submitTicket,
    getMyTickets,
    getTicket,
    validateSubmitTicket,
} from '../controllers/support.controller.js'
import { updateLastSeen } from '../middlewares/updateLastSeen.js'

const router = Router()

// ─── Public (authenticated users) ─────────────────────────────────────────────
router.use(authenticate)
router.use(updateLastSeen)

router.get('/categories', getCategories)
router.get('/', getMyTickets)
router.get('/:ticketId', getTicket)
router.post('/', validateSubmitTicket, submitTicket)

export default router

