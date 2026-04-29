import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.js";
import { authLimiter } from "../middlewares/limiter.js";
import { USER_ROLE } from "../utils/constant.js";
import { ADMIN_PATHS } from "../constants/page-route.js";
import { adminLogin, validateAdminLogin } from "../controllers/auth.controller.js";
import {
    listUsers,              getUserDetail,
    validateSuspendUser,    suspendUser,
    validateCbcCredit,      adminCreditCbc,
    listErrands,            getErrandDetail,
    listOrders,             getOrderDetail,
    listSubscriptions,      getSubscriptionDetail,
    getVerificationDetail,
    validateResolveDispute,
    resolveErrandDispute,
    resolveOrderDispute,
    listClearances,
    approveClearance,
    rejectClearance,
    reapproveClearance,
    bulkApproveClearances,
    streamVerificationDocument,
} from "../controllers/admin.controller.js";

import {
  createPlan,
  getPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  togglePlanStatus,
  validateCreatePlan,
  validateUpdatePlan,
} from "../controllers/plan.controller.js";

import {
    listVerificationsAdmin,
    reviewVerification,
    validateReviewDoc,
} from "../controllers/verifications.controller.js";
import { adminGetTicket, adminListTickets, adminUpdateTicket, validateAdminUpdateTicket } from "../controllers/support.controller.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.post(ADMIN_PATHS.LOGIN, authLimiter, validateAdminLogin, adminLogin);

// ─── All routes below require a valid admin JWT ───────────────────────────────
router.use(authenticate, authorize(USER_ROLE.ADMIN as "admin"));
router.use(updateLastSeen)
// ── Verifications ─────────────────────────────────────────────────────────────
router.get(  ADMIN_PATHS.VERIFICATIONS,        listVerificationsAdmin);
router.get(  ADMIN_PATHS.VERIFICATION_DETAIL,  getVerificationDetail);
router.get('/verifications/:verificationId/document', streamVerificationDocument)
router.patch(ADMIN_PATHS.VERIFICATION_REVIEW,  validateReviewDoc, reviewVerification);

// ── Users ─────────────────────────────────────────────────────────────────────
router.get(  ADMIN_PATHS.USERS,        listUsers);
router.get(  ADMIN_PATHS.USER_DETAIL,  getUserDetail);
router.patch(ADMIN_PATHS.SUSPEND_USER, validateSuspendUser, suspendUser);

// ── CBC ───────────────────────────────────────────────────────────────────────
router.post(ADMIN_PATHS.CBC_CREDIT, validateCbcCredit, adminCreditCbc);

// ── Errands ───────────────────────────────────────────────────────────────────
router.get(  ADMIN_PATHS.ERRANDS,        listErrands);
router.get(  ADMIN_PATHS.ERRAND_DETAIL,  getErrandDetail);
router.patch(ADMIN_PATHS.ERRAND_RESOLVE, validateResolveDispute, resolveErrandDispute);

// ── Orders ────────────────────────────────────────────────────────────────────
router.get(  ADMIN_PATHS.ORDERS,        listOrders);
router.get(  ADMIN_PATHS.ORDER_DETAIL,  getOrderDetail);
router.patch(ADMIN_PATHS.ORDER_RESOLVE, validateResolveDispute, resolveOrderDispute);

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get(ADMIN_PATHS.SUBSCRIPTIONS,        listSubscriptions);
router.get(ADMIN_PATHS.SUBSCRIPTION_DETAIL,  getSubscriptionDetail);

// ── Earnings Clearances ───────────────────────────────────────────────────────
// IMPORTANT: bulk-approve must be registered before :clearanceId routes
// to prevent Express matching "bulk-approve" as a clearanceId param
router.get(  ADMIN_PATHS.CLEARANCES,              listClearances);
router.post( ADMIN_PATHS.CLEARANCES_BULK_APPROVE, bulkApproveClearances);
router.patch(ADMIN_PATHS.CLEARANCE_APPROVE,       approveClearance);
router.patch(ADMIN_PATHS.CLEARANCE_REJECT,        rejectClearance);
router.patch(ADMIN_PATHS.CLEARANCE_REAPPROVE,     reapproveClearance);

// Plan

router.post(ADMIN_PATHS.CREATE_PLANS, validateCreatePlan, createPlan);
router.get(ADMIN_PATHS.LIST_PLANS, getPlans);
router.get(ADMIN_PATHS.GET_ONE_PLAN, getPlanById);
router.patch(ADMIN_PATHS.UPDATE_PLANS, validateUpdatePlan, updatePlan);
router.delete(ADMIN_PATHS.DELETE_PLAN, deletePlan);
router.patch(ADMIN_PATHS.TOGGLE_PLAN, togglePlanStatus);


// ─── Support Tickets (attach to /api/v1/admin/support) ─────────────────
router.get('/support', adminListTickets)
router.get('/support/:ticketId',  authorize('admin'), adminGetTicket)
router.patch('/support/:ticketId',  validateAdminUpdateTicket, adminUpdateTicket)

export default router;