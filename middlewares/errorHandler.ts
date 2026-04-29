import type { Request, Response, NextFunction } from "express";
import AppError from "../utils/appError.js";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Known operational error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data: { message: err.message },
    });
    return;
  }

  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).name === "MongoServerError" && (err as unknown as { code: number }).code === 11000) {
    const field = Object.keys((err as unknown as { keyValue: Record<string, unknown> }).keyValue || {})[0] || "field";
    res.status(409).json({
      success: false,
      data: { message: `${field} already exists` },
    });
    return;
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values((err as unknown as { errors: Record<string, { message: string }> }).errors)
      .map((e) => e.message);
    res.status(422).json({
      success: false,
      data: { message: "Validation failed", errors: messages },
    });
    return;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({ success: false, data: { message: "Invalid token" } });
    return;
  }
  if (err.name === "TokenExpiredError") {
    res.status(401).json({ success: false, data: { message: "Token expired" } });
    return;
  }

  // Unhandled — log and return 500
  console.error("💥 Unhandled error:", err);
  res.status(500).json({
    success: false,
    data: {
      message:
        process.env.NODE_ENV === "production"
          ? "Something went wrong"
          : err.message,
    },
  });
};
