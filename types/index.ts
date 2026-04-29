import { USER_ROLE, SUBSCRIPTION_TIER, VERIFICATION_STATUS } from "../utils/constant.js";

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type SubscriptionTier = (typeof SUBSCRIPTION_TIER)[keyof typeof SUBSCRIPTION_TIER];
export type VerificationStatus = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

export interface JwtPayload {
  userId: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}
