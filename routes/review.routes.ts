import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  submitReview,    validateSubmitReview,
  getUserReviews,
  getMyReviews,
} from "../controllers/review.controller.js";

const router = Router();

router.get( "/mine",  authenticate, getMyReviews);
router.get("/:userId", getUserReviews);

router.post("/",    authenticate,  validateSubmitReview, submitReview);

export default router;