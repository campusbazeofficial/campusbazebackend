import { Router, type Request, type Response, type NextFunction } from "express";
import { paystackWebhookHandler } from "../utils/webhook.js";

const router = Router();


export const captureRawBody = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const body = req.body;

  if (Buffer.isBuffer(body)) {
    req.rawBody = body.toString("utf8");
  } else if (typeof body === "string") {
    req.rawBody = body;
  } else {
    req.rawBody = JSON.stringify(body);
  }

  try {
    req.body = JSON.parse(req.rawBody || "{}");
  } catch (err) {
    console.error("[Webhook] Failed to parse body:", req.rawBody, err);
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

