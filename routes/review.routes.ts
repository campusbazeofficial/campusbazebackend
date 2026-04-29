import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  submitReview,    validateSubmitReview,
  getUserReviews,
  getMyReviews,
} from "../controllers/review.controller.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();
router.get("/:userId", getUserReviews);
router.use(authenticate);
router.use(updateLastSeen)
router.get( "/mine",  getMyReviews);

router.post("/",     validateSubmitReview, submitReview);

export default router;