import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.js";
import { USER_PATHS } from "../constants/page-route.js";
import {
  getMe,
  updateIndividualProfile,  validateUpdateIndividualProfile,
  updateCorporateProfile,   validateUpdateCorporateProfile,
  uploadAvatar,             avatarUploadMiddleware,
  deleteAvatar,
  uploadCompanyLogo,        logoUploadMiddleware,
  getDashboard,
  getSessions,
  getPublicProfile,
  searchUsers,
  getReferralInfo,
  generateBio,
  validateReferralCode,
  deleteAccount,
  getRecentSearches,
  clearRecentSearches,
} from "../controllers/users.controller.js";
import { USER_ROLE } from "../utils/constant.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();

router.get(USER_PATHS.VALIDATE_REFERRAL_CODE, validateReferralCode)

router.use(authenticate);
router.use(updateLastSeen)

router.get(USER_PATHS.ME, getMe);

router.patch(USER_PATHS.ME, validateUpdateIndividualProfile, updateIndividualProfile);
router.patch(USER_PATHS.ME_CORPORATE, authorize(USER_ROLE.CORPORATE), validateUpdateCorporateProfile, updateCorporateProfile);
router.get(USER_PATHS.ME_DASHBOARD, getDashboard);
router.get("/me/referral",          getReferralInfo);
router.post(  USER_PATHS.ME_AVATAR, avatarUploadMiddleware, uploadAvatar);
router.delete(USER_PATHS.ME_AVATAR, deleteAvatar);
router.get(USER_PATHS.ME_SESSIONS, getSessions);
router.post(USER_PATHS.ME_COMPANY_LOGO, authorize(USER_ROLE.CORPORATE), logoUploadMiddleware, uploadCompanyLogo);
router.get(USER_PATHS.SEARCH,         searchUsers);
router.get(USER_PATHS.GENERATE_BIO, generateBio);
router.get(USER_PATHS.PUBLIC_PROFILE, getPublicProfile);
router.delete(USER_PATHS.DELETE_ACCOUNT, deleteAccount);
router.delete(USER_PATHS.CLEAR_RECENT_SEARCHES, clearRecentSearches);
router.get(USER_PATHS.GET_RECENT_SEARCHES, getRecentSearches);

export default router;
