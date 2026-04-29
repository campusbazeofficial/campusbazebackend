import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from 'express'

import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
} from "../utils/constant.js";

const rateLimitResponse = (message: string) => ({
  success: false,
  data: { message },
});

// Applied to all /auth routes
export const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(
    "Too many attempts from this IP. Please try again in 15 minutes."
  ),
});

// Applied globally to all API routes
export const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests. Please slow down."),
});

const rateLimitHandler = (req: Request, res: Response) => {
    res.status(429).json({
        status: 'fail',
        message: 'Too many requests. Please try again later.',
    })
}

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,

  // keyGenerator: (req) => {
  //   const email = req.body?.email;

  //   if (email && typeof email === "string") {
  //     return email.toLowerCase().trim();
  //   }

  //   return ipKeyGenerator(req.ip ?? ""); // ✅ FIXED
  // },

keyGenerator: (req) => {
  const email = req.body?.email;
  const ip = req.ip ?? "";

  return email
    ? `${email.toLowerCase().trim()}-${ip}`
    : ipKeyGenerator(req.ip ?? "");
},

  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    res.status(429).json({
      status: "fail",
      message:
        "Too many OTP requests. Please wait before requesting another code.",
    });
  },
});

export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // slightly stricter than authLimiter

  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    res.status(429).json({
      status: "fail",
      message: "Too many password reset attempts. Please try again later.",
    });
  },
});

export const verifyOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 5, // fewer attempts

  keyGenerator: (req) => {
    const email = req.body?.email;
    return email?.toLowerCase().trim() ||  ipKeyGenerator(req.ip ?? "") || "unknown";
  },

  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    res.status(429).json({
      status: "fail",
      message: "Too many OTP attempts. Please try again later.",
    });
  },
});
