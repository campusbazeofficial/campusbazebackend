// import { Router } from "express";
// import { authenticate, authorize } from "../middlewares/auth.js";
// import { PLAN_PATHS } from "../constants/page-route.js";

// import {
//   createPlan,
//   getPlans,
//   getPlanById,
//   updatePlan,
//   deletePlan,
//   togglePlanStatus,
//   validateCreatePlan,
//   validateUpdatePlan,
// } from "../controllers/plan.controller.js";
// import { USER_ROLE } from "../utils/constant.js";

//  const router = Router();

// router.use(authenticate, authorize(USER_ROLE.ADMIN));

// router.post(PLAN_PATHS.CREATE, validateCreatePlan, createPlan);
// router.get(PLAN_PATHS.LIST, getPlans);
// router.get(PLAN_PATHS.GET_ONE, getPlanById);
// router.patch(PLAN_PATHS.UPDATE, validateUpdatePlan, updatePlan);
// router.delete(PLAN_PATHS.DELETE, deletePlan);
// router.patch(PLAN_PATHS.TOGGLE, togglePlanStatus);

// export default router;