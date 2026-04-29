import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { validate } from '../middlewares/validate.js'
import { verificationDocUpload } from '../middlewares/upload.js'
import { sendSuccess, sendCreated } from '../utils/response.js'
import { BadRequestError, ValidationError } from '../utils/appError.js'
import { VERIFICATION_STATUS } from '../utils/constant.js'
import { VERIFICATION_DOC_TYPE } from '../models/verification.model.js'
import { VerificationService } from '../services/verification.service.js'

const verificationService = new VerificationService()

export const submitDocSchema = z.object({
    docType: z.nativeEnum(VERIFICATION_DOC_TYPE),
})
type SubmitDocInput = z.infer<typeof submitDocSchema>
export const reviewDocSchema = z.object({
    status: z.enum([
        VERIFICATION_STATUS.VERIFIED,
        VERIFICATION_STATUS.REJECTED,
    ]),
    adminNote: z.string().max(500).optional(),
})
export const sendPhoneOtpSchema = z.object({
    phone: z
        .string()
        .min(7, 'Phone number is too short')
        .max(20, 'Phone number is too long')
        .regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone number format'),
})
export const verifyPhoneOtpSchema = z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 characters'),
})

export const validateSubmitDoc = validate(submitDocSchema)
export const validateReviewDoc = validate(reviewDocSchema)
export const validateSendPhoneOtp = validate(sendPhoneOtpSchema)
export const validateVerifyPhone = validate(verifyPhoneOtpSchema)

export const verificationUpload = verificationDocUpload.single('document')

export const submitDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        if (!req.file) throw new BadRequestError('No document file provided')
        const parsed = submitDocSchema.parse(req.body)
        const { docType } = parsed

        const result = await verificationService.submitDocument(
            req.user!._id.toString(),
            docType,
            req.file.buffer,
            req.file.mimetype,
        )

        sendCreated(res, {
            message:
                'Document submitted for review. You will be notified once reviewed.',
            verification: result,
        })
    } catch (err) {
        next(err)
    }
}

export const getAllowedDocTypes = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await verificationService.getAllowedDocTypes(
            req.user!._id.toString(),
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const getMyVerifications = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const verifications = await verificationService.getMyVerifications(
            req.user!._id.toString(),
        )
        sendSuccess(res, { verifications })
    } catch (err) {
        next(err)
    }
}
export const getVerificationStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const status = await verificationService.getVerificationStatus(
            req.user!._id.toString(),
        )
        sendSuccess(res, { status })
    } catch (err) {
        next(err)
    }
}
export const sendPhoneVerificationOtp = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { phone } = req.body as { phone?: string }

        if (!phone?.trim()) {
            return next(new ValidationError('Phone number is required'))
        }

        const result = await verificationService.sendPhoneVerificationOtp(
            req.user!._id.toString(),
            phone.trim(),
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}
export const verifyPhoneNumber = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { otp } = req.body as { otp: string }
        const result = await verificationService.verifyPhoneOtp(
            req.user!._id.toString(),
            otp,
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}
export const listVerificationsAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await verificationService.listForAdmin({
            status: req.query.status as string | undefined,
            flagged: req.query.flagged === 'true',
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
        })
        res.json({ success: true, data: result.data, meta: result.meta })
    } catch (err) {
        next(err)
    }
}
export const reviewVerification = async (
    req: Request<{ verificationId: string }>,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { verificationId } = req.params
        const { status, adminNote } = req.body as {
            status: string
            adminNote?: string
        }

        const result = await verificationService.reviewDocument(
            verificationId,
            req.user!._id.toString(),
            status,
            adminNote,
        )

        const action =
            status === VERIFICATION_STATUS.VERIFIED ? 'approved' : 'rejected'
        sendSuccess(res, {
            message: `Verification ${action} successfully`,
            verification: result,
        })
    } catch (err) {
        next(err)
    }
}
