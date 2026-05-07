import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  submitReview,    validateSubmitReview,
  getReviews,
  getMyReviews,
} from "../controllers/review.controller.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();
router.get("/", getReviews);
router.use(authenticate);
router.use(updateLastSeen)
router.get( "/mine",  getMyReviews);

router.post("/",     validateSubmitReview, submitReview);

export default router;