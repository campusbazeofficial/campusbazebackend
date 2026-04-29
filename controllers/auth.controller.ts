import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import { validate } from "../middlewares/validate.js";
import { sendSuccess, sendCreated } from "../utils/response.js";

const authService = new AuthService();

// ─── Validation schemas ───────────────────────────────────────────────────────

export const registerIndividualSchema = z.object({
  firstName:       z.string().min(1).max(50),
  lastName:        z.string().min(1).max(50),
  email:           z.string().email(),
  password:        z.string().min(8, "Password must be at least 8 characters"),
  phone:           z.string().optional(),
  isStudent:       z.boolean().optional(),
  institutionName: z.string().optional(),
  referralCode:    z.string().optional(),
});

export const registerCorporateSchema = z.object({
  firstName:    z.string().min(1).max(50),
  lastName:     z.string().min(1).max(50),
  email:        z.string().email(),
  password:     z.string().min(8),
  phone:        z.string().optional(),
  companyName:  z.string().min(1).max(100),
  companyEmail: z.string().email(),
  companyPhone: z.string().optional(),
  rcNumber:     z.string().optional(),
  industry:     z.string().optional(),
  website:      z.string().url().optional().or(z.literal("")),
  country:      z.string().optional(),
  state:        z.string().optional(),
  referralCode: z.string().optional(),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp:   z.string().length(6, "OTP must be 6 digits"),
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
});

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
});

export const adminLoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const validateAdminLogin = validate(adminLoginSchema);
export const validateRegisterIndividual = validate(registerIndividualSchema);
export const validateRegisterCorporate  = validate(registerCorporateSchema);
export const validateVerifyEmail        = validate(verifyEmailSchema);
export const validateResendOtp          = validate(resendOtpSchema);
export const validateLogin              = validate(loginSchema);
export const validateRefresh            = validate(refreshSchema);
export const validateForgotPassword     = validate(forgotPasswordSchema);
export const validateResetPassword      = validate(resetPasswordSchema);
export const validateChangePassword     = validate(changePasswordSchema);

export const registerIndividual = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.registerIndividual(req.body);
    sendCreated(res, result);
  } catch (err) { next(err); }
};

export const registerCorporate = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.registerCorporate(req.body);
    sendCreated(res, result);
  } catch (err) { next(err); }
};

export const verifyEmail = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { email, otp } = req.body as { email: string; otp: string };
    const result = await authService.verifyEmailOtp(email, otp);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const resendOtp = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.resendEmailOtp(req.body.email);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const login = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const ipAddress  = req.ip ?? req.headers["x-forwarded-for"]?.toString();
    const deviceInfo = req.headers["user-agent"];
    const result = await authService.login({ ...req.body, ipAddress, deviceInfo });
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const refreshTokens = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const tokens = await authService.refreshTokens(req.body.refreshToken);
    sendSuccess(res, tokens);
  } catch (err) { next(err); }
};

export const logout = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, { message: "Logged out successfully" });
  } catch (err) { next(err); }
};

export const revokeSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await authService.revokeSession(
            req.user!._id.toString(),
            req.params.sessionId as string,
        )
        sendSuccess(res, { message: 'Session revoked successfully' })
    } catch (err) {
        next(err)
    }
}

export const logoutAll = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    await authService.logoutAll(req.user!._id.toString());
    sendSuccess(res, { message: "All sessions revoked" });
  } catch (err) { next(err); }
};

export const forgotPassword = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const resetPassword = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const result = await authService.resetPassword(token, newPassword);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const changePassword = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const result = await authService.changePassword(
      req.user!._id.toString(), currentPassword, newPassword
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const adminLogin = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const ipAddress  = req.ip ?? req.headers["x-forwarded-for"]?.toString();
    const deviceInfo = req.headers["user-agent"];
    const result = await authService.adminLogin({
      ...req.body as { email: string; password: string },
      ipAddress,
      deviceInfo,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
};
