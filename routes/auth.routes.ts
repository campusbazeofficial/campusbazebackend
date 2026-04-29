import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import { authLimiter, otpLimiter, resetPasswordLimiter, verifyOtpLimiter } from '../middlewares/limiter.js'
import { AUTH_PATHS } from '../constants/page-route.js'
import {
    registerIndividual,   validateRegisterIndividual,
    registerCorporate,    validateRegisterCorporate,
    verifyEmail,          validateVerifyEmail,
    resendOtp,            validateResendOtp,
    login,                validateLogin,
    refreshTokens,        validateRefresh,
    logout,
    logoutAll,
    forgotPassword,       validateForgotPassword,
    resetPassword,        validateResetPassword,
    changePassword,       validateChangePassword,
    revokeSession,
} from '../controllers/auth.controller.js'
import { updateLastSeen } from '../middlewares/updateLastSeen.js'

const router = Router()

// ─── Public ───────────────────────────────────────────────────────────────────
router.post(AUTH_PATHS.REGISTER,           authLimiter,          validateRegisterIndividual, registerIndividual)
router.post(AUTH_PATHS.REGISTER_CORPORATE, authLimiter,          validateRegisterCorporate,  registerCorporate)
router.post(AUTH_PATHS.VERIFY_EMAIL,       verifyOtpLimiter,     validateVerifyEmail,        verifyEmail)
router.post(AUTH_PATHS.RESEND_OTP,         otpLimiter,           validateResendOtp,          resendOtp)
router.post(AUTH_PATHS.LOGIN,              authLimiter,          validateLogin,              login)
router.post(AUTH_PATHS.REFRESH,            authLimiter,          validateRefresh,            refreshTokens)
router.post(AUTH_PATHS.LOGOUT,             authLimiter,          validateRefresh,            logout)
router.post(AUTH_PATHS.FORGOT_PASSWORD,    authLimiter,          validateForgotPassword,     forgotPassword)
router.post(AUTH_PATHS.RESET_PASSWORD,     resetPasswordLimiter, validateResetPassword,      resetPassword)

// ─── Protected ────────────────────────────────────────────────────────────────
router.use(authenticate)
router.use(updateLastSeen)
router.post( AUTH_PATHS.LOGOUT_ALL,                           logoutAll)
router.delete(AUTH_PATHS.REVOKE_SESSION,                           revokeSession)
router.patch(AUTH_PATHS.CHANGE_PASSWORD, validateChangePassword, changePassword)
export default router
