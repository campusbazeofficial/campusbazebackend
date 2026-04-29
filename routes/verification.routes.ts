import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.js";
import { otpLimiter, verifyOtpLimiter } from "../middlewares/limiter.js";
import { VERIFICATION_PATHS } from "../constants/page-route.js";
import {
  // Identity document submission
  submitDocument,           validateSubmitDoc,    verificationUpload,
  getMyVerifications,
  getVerificationStatus,
  sendPhoneVerificationOtp, validateSendPhoneOtp,
  verifyPhoneNumber,        validateVerifyPhone,
  getAllowedDocTypes,
} from "../controllers/verifications.controller.js";
import { USER_ROLE } from "../utils/constant.js";

const router = Router();

router.use(authenticate);

router.post(VERIFICATION_PATHS.SUBMIT, verificationUpload, validateSubmitDoc, submitDocument);
router.get( VERIFICATION_PATHS.MY,     getMyVerifications);
router.get( VERIFICATION_PATHS.STATUS, getVerificationStatus);
router.get( VERIFICATION_PATHS.ALLOWED_DOCS, getAllowedDocTypes);
router.post(VERIFICATION_PATHS.PHONE_SEND_OTP, otpLimiter,    authorize(USER_ROLE.STUDENT, USER_ROLE.PROFESSIONAL, USER_ROLE.CORPORATE),   validateSendPhoneOtp, sendPhoneVerificationOtp);
router.post(VERIFICATION_PATHS.PHONE_VERIFY,   verifyOtpLimiter, authorize(USER_ROLE.STUDENT, USER_ROLE.PROFESSIONAL, USER_ROLE.CORPORATE), validateVerifyPhone,  verifyPhoneNumber);

export default router;
