import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { validate } from "../middlewares/validate.js";
import { sendSuccess, sendCreated, sendPaginated } from "../utils/response.js";
import { parsePaginationQuery } from "../utils/paginate.js";
import { ReviewService } from "../services/review.service.js";

const reviewService = new ReviewService();

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const submitReviewSchema = z.object({
  refId:   z.string().min(1),
  refType: z.enum(["order", "errand"]),
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(1500).optional(),
});

export const validateSubmitReview = validate(submitReviewSchema);

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/reviews
 * Submit a review after an order is completed or an errand is confirmed.
 * Only the buyer/poster can review — one review per transaction.
 */
export const submitReview = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const review = await reviewService.submitReview(
      req.user!._id.toString(),
      req.body as z.infer<typeof submitReviewSchema>
    );
    sendCreated(res, { review });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/reviews/
 * Public — get all reviews .
 */
export const getReviews = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts   = parsePaginationQuery(req.query as Record<string, string>);
    const result = await reviewService.getReviews(opts);
    sendPaginated(res, result);
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/reviews/mine
 * Get reviews the authenticated user has written.
 */
export const getMyReviews = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts   = parsePaginationQuery(req.query as Record<string, string>);
    const result = await reviewService.getMyReviews(req.user!._id.toString(), opts);
    sendPaginated(res, result);
  } catch (err) { next(err); }
};