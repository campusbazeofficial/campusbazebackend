import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ACCESS_TOKEN_EXPIRES, REFRESH_TOKEN_EXPIRES } from "./constant.js";

export interface TokenPayload {
    userId: string
    role: string
    sessionId: string  // ✅ add
}

const getAccessSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
};

const getRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set");
  return secret;
};

export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  } as jwt.SignOptions);
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES,
  } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, getAccessSecret()) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, getRefreshSecret()) as TokenPayload;
};

export const generateOtp = (length = 6): string => {
  const digits = "0123456789";
  return Array.from(
    { length },
    () => digits[Math.floor(Math.random() * digits.length)]
  ).join("");
};
export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};
