import { Router, type Request, type Response, type NextFunction } from "express";
import { paystackWebhookHandler } from "../utils/webhook.js";

const router = Router();


export const captureRawBody = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const buffer = req.body as Buffer;

  req.rawBody = buffer?.toString("utf8");

  try {
    req.body = JSON.parse(req.rawBody || "{}");
  } catch {
    req.body = {};
  }

  next();
};

router.post(
  "/paystack",
  captureRawBody,
  paystackWebhookHandler
);

export default router;

