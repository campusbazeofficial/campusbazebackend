import { Router } from 'express'
import { authenticate, authorize } from '../middlewares/auth.js'
import { WITHDRAWAL_PATHS } from '../constants/page-route.js'
import {
    requestWithdrawal,
    cancelWithdrawal,
    getWithdrawals,
    adminProcessWithdrawal,
    adminListWithdrawals,
} from '../controllers/withdrawal.controller.js'
import { USER_ROLE } from '../utils/constant.js'

const router = Router()

router.use(authenticate)

router.post(WITHDRAWAL_PATHS.REQUEST, requestWithdrawal)
router.get(WITHDRAWAL_PATHS.HISTORY, getWithdrawals)
router.delete(WITHDRAWAL_PATHS.CANCEL, cancelWithdrawal)

// ── Admin only ────────────────────────────────────────────────────────────────
router.get(WITHDRAWAL_PATHS.ADMIN_LIST, authorize(USER_ROLE.ADMIN), adminListWithdrawals)
router.post(WITHDRAWAL_PATHS.ADMIN_PROCESS, authorize(USER_ROLE.ADMIN), adminProcessWithdrawal)

export default router