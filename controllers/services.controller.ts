import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ServiceListingService } from "../services/services.service.js";
import { validate } from "../middlewares/validate.js";
import { sendSuccess, sendCreated, sendPaginated } from "../utils/response.js";
import { parsePaginationQuery } from "../utils/paginate.js";
import { SERVICE_CATEGORY } from "../utils/constant.js";

const listingService = new ServiceListingService();

// ─── Validation schemas ───────────────────────────────────────────────────────

const tierSchema = z.object({
  name:         z.enum(["starter", "standard", "premium"]),
  price:        z.number().positive("Tier price must be positive"),
  deliveryDays: z.number().int().positive("Delivery days must be at least 1"),
  description:  z.string().min(5).max(500),
  revisions:    z.number().int().min(0).default(1),
});

export const createListingSchema = z.object({
  title:         z.string().min(3).max(120),
  description:   z.string().min(20, "Description must be at least 20 characters").max(3000),
  category:      z.enum(Object.values(SERVICE_CATEGORY) as [string, ...string[]]),
  tiers:         z.array(tierSchema).min(1, "At least one pricing tier is required"),
  tags:          z.array(z.string().max(30)).max(10).optional(),
  portfolioUrls: z.array(z.string().url("Each portfolio URL must be a valid URL")).max(10).optional(),
});

export const updateListingSchema = createListingSchema
  .partial()
  .extend({ status: z.enum(["active", "paused", "draft"]).optional() });

export const placeOrderSchema = z.object({
  tierName:    z.enum(["starter", "standard", "premium"]),
  requirements: z.string().max(2000).optional(),
  callbackUrl: z.string().url().optional(),
});

export const deliverOrderSchema = z.object({
  deliveryNote: z.string().max(2000).optional(),
});

export const revisionSchema = z.object({
  note: z.string().min(5, "Please describe the revision needed").max(1000),
});

export const disputeOrderSchema = z.object({
  reason: z.string().min(10, "Please describe the issue in at least 10 characters").max(1000),
});

// ─── Middleware exports ───────────────────────────────────────────────────────

export const validateCreateListing  = validate(createListingSchema);
export const validateUpdateListing  = validate(updateListingSchema);
export const validatePlaceOrder     = validate(placeOrderSchema);
export const validateDeliverOrder   = validate(deliverOrderSchema);
export const validateRevision       = validate(revisionSchema);
export const validateDisputeOrder   = validate(disputeOrderSchema);

// ─── Listing handlers ─────────────────────────────────────────────────────────

export const createListing = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const listing = await listingService.createListing(
      req.user!._id.toString(),
      req.body as z.infer<typeof createListingSchema>
    );
    sendCreated(res, { listing });
  } catch (err) { next(err); }
};

export const browseListings = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const pagination = parsePaginationQuery(req.query as Record<string, string>);
    const result = await listingService.browseListings({
      ...pagination,
      category:  req.query.category  as string | undefined,
      q:         req.query.q         as string | undefined,
      maxPrice:  req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    });
    sendPaginated(res, result);
  } catch (err) { next(err); }
};

export const myListings = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts = parsePaginationQuery(req.query as Record<string, string>);
    const result = await listingService.myListings(req.user!._id.toString(), opts);
    sendPaginated(res, result);
  } catch (err) { next(err); }
};

export const getListing = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const listing = await listingService.getListing(req.params.serviceId as string);
    sendSuccess(res, { listing });
  } catch (err) { next(err); }
};

export const updateListing = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const listing = await listingService.updateListing(
      req.params.serviceId as string,
      req.user!._id.toString(),
      req.body as z.infer<typeof updateListingSchema>
    );
    sendSuccess(res, { listing });
  } catch (err) { next(err); }
};

export const deleteListing = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const result = await listingService.deleteListing(
      req.params.serviceId as string,
      req.user!._id.toString()
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

// ─── Order handlers ───────────────────────────────────────────────────────────

export const placeOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { tierName, requirements, callbackUrl } = req.body as z.infer<typeof placeOrderSchema>;
    const result = await listingService.placeOrder(
      req.user!._id.toString(),
      req.user!.email,
      req.params.serviceId as string,
      tierName,
      requirements,
    );
    sendCreated(res, result);
  } catch (err) { next(err); }
};

export const myOrdersBuying = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts = parsePaginationQuery(req.query as Record<string, string>);
    const result = await listingService.myOrdersBuying(req.user!._id.toString(), opts);
    sendPaginated(res, result);
  } catch (err) { next(err); }
};

export const myOrdersSelling = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts = parsePaginationQuery(req.query as Record<string, string>);
    const result = await listingService.myOrdersSelling(req.user!._id.toString(), opts);
    sendPaginated(res, result);
  } catch (err) { next(err); }
};

export const getOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.getOrder(
      req.params.orderId as string,
      req.user!._id.toString()
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

export const deliverOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.deliverOrder(
      req.params.orderId as string,
      req.user!._id.toString(),
      (req.body as { deliveryNote?: string }).deliveryNote
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

export const confirmOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.confirmOrder(
      req.params.orderId as string,
      req.user!._id.toString()
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

export const requestRevision = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.requestRevision(
      req.params.orderId as string,
      req.user!._id.toString(),
      (req.body as { note: string }).note
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

export const disputeOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.disputeOrder(
      req.params.orderId as string,
      req.user!._id.toString(),
      (req.body as { reason: string }).reason
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

export const cancelOrder = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const order = await listingService.cancelOrder(
      req.params.orderId as string,
      req.user!._id.toString()
    );
    sendSuccess(res, { order });
  } catch (err) { next(err); }
};

// controllers/order.controller.ts


export const cancelOrderAsSeller = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orderId = req.params.orderId;
    const sellerId = req.user!._id.toString();
    const { reason } = req.body;

    const order = await listingService.cancelOrderAsSeller(
      orderId as string,
      sellerId,
      reason
    );

    sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};
export const payForOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const payment = await listingService.initiateOrderPayment(
      req.user!._id.toString(),
      req.params.orderId as string,
      req.user!.email
    )

    sendSuccess(res, { payment })
  } catch (err) {
    next(err)
  }
}