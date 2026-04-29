import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { UserService } from '../services/user.service.js'
import { validate } from '../middlewares/validate.js'
import { upload } from '../middlewares/upload.js'
import { sendSuccess, sendPaginated } from '../utils/response.js'
import { parsePaginationQuery } from '../utils/paginate.js'
import QRCode from 'qrcode'
import { BadRequestError } from '../utils/appError.js'
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'
import { QueryValue } from '../utils/paginate.js'
import { USER_ROLE } from '../utils/constant.js'
import User from '../models/user.model.js'
import Session from '../models/session.model.js'
const userService = new UserService()

export const updateIndividualProfileSchema = z.object({
    firstName: z
        .string()
        .min(1, 'First name cannot be empty')
        .max(50)
        .optional(),
    lastName: z.string().min(1, 'Last name cannot be empty').max(50).optional(),
    displayName: z.string().max(60).optional(),
    bio: z.string().max(500).optional(),
    phone: z.string().optional(),
    institutionName: z.string().max(150).optional(),
    yearOfStudy: z.number().int().min(1).max(10).optional(),
})
export interface SearchUsersRequest {
    query?: string
    role?: string
    isStudent?: boolean
    page?: number
    limit?: number
    sort?: string
    order?: 'asc' | 'desc'
    [key: string]: QueryValue
}

export const updateCorporateProfileSchema = z.object({
    firstName: z
        .string()
        .min(1, 'First name cannot be empty')
        .max(50)
        .optional(),
    lastName: z.string().min(1, 'Last name cannot be empty').max(50).optional(),
    displayName: z.string().max(60).optional(),
    bio: z.string().max(500).optional(),
    phone: z.string().optional(),
    // Company document
    companyName: z.string().min(1).max(100).optional(),
    companyPhone: z.string().optional(),
    description: z.string().max(1000).optional(),
    website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    industry: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
})
const generateBioSchema = z.object({
    firstName: z.string().min(1).max(50),
    role: z.string().min(1).max(50),
    skills: z.array(z.string().max(80)).max(20).optional(),
})

export const validateGenerateBio = validate(generateBioSchema)

export const validateUpdateIndividualProfile = validate(
    updateIndividualProfileSchema,
)
export const validateUpdateCorporateProfile = validate(
    updateCorporateProfileSchema,
)
export const avatarUploadMiddleware = upload.single('avatar')
export const logoUploadMiddleware = upload.single('logo')
export const getMe = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await userService.getMe(req.user!._id.toString())
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}
export const updateIndividualProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await userService.updateIndividualProfile(
            req.user!._id.toString(),
            req.body as z.infer<typeof updateIndividualProfileSchema>,
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const updateCorporateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await userService.updateCorporateProfile(
            req.user!._id.toString(),
            req.body as z.infer<typeof updateCorporateProfileSchema>,
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const uploadAvatar = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        if (!req.file) throw new BadRequestError('No image file provided')
        const avatarUrl = await userService.uploadAvatar(
            req.user!._id.toString(),
            req.file.buffer,
        )
        sendSuccess(res, { avatarUrl, message: 'Profile image updated' })
    } catch (err) {
        next(err)
    }
}

export const deleteAvatar = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await userService.deleteAvatar(req.user!._id.toString())
        sendSuccess(res, { message: 'Profile image removed' })
    } catch (err) {
        next(err)
    }
}

export const uploadCompanyLogo = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        if (!req.file) throw new BadRequestError('No image file provided')
        const logoUrl = await userService.uploadCompanyLogo(
            req.user!._id.toString(),
            req.file.buffer,
        )
        sendSuccess(res, { logoUrl, message: 'Company logo updated' })
    } catch (err) {
        next(err)
    }
}

export const getDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const dashboard = await userService.getDashboard(
            req.user!._id.toString(),
        )
        sendSuccess(res, dashboard)
    } catch (err) {
        next(err)
    }
}

export const getSessions = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const sessions = await userService.getSessions(
            req.user!._id.toString(),
            req.user!.sessionId,
        )
        sendSuccess(res, { sessions })
    } catch (err) {
        next(err)
    }
}

export const getPublicProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await userService.getPublicProfile(
            req.params.identifier as string,
            req.user?._id.toString(),
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const searchUsers = async (
    req: Request<{}, {}, SearchUsersRequest>,
    res: Response,
    next: NextFunction,
) => {
    try {
        type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]

        // const allowedRoles = Object.values(USER_ROLE) as UserRole[]

        const query = req.query as Record<string, string>

        const options = {
            ...parsePaginationQuery(query),
            query: query.query,
            isStudent:
                query.isStudent !== undefined
                    ? query.isStudent === 'true'
                    : undefined,
        }

        const result = await userService.searchUsers({
            ...options,
            requestingUserId: req.user!._id.toString(),
        })

        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const getReferralInfo = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const user = req.user!
        const referralCode = user.referralCode
        const referralLink = `${CLIENT_URL}/register?ref=${referralCode}`

        const qrCodeBase64 = await QRCode.toDataURL(referralLink, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 300,
            color: {
                dark: '#1a56db',
                light: '#ffffff',
            },
        })

        sendSuccess(res, {
            referralCode,
            referralLink,
            qrCode: qrCodeBase64, // data:image/png;base64,...
        })
    } catch (err) {
        next(err)
    }
}

export const generateBio = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const bio = await userService.generateBio(req.user!._id.toString())
        sendSuccess(res, { bio })
    } catch (err) {
        next(err)
    }
}

export const validateReferralCode = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { code } = req.params as { code: string }

        const referrer = await User.findOne({
            referralCode: code.trim().toUpperCase(),
            isActive: true,
        })
            .select('firstName lastName displayName avatar')
            .lean()

        if (!referrer) {
            res.status(404).json({
                success: false,
                data: { message: 'Invalid referral code' },
            })
            return
        }

        sendSuccess(res, {
            valid: true,
            referrer: {
                name: referrer.displayName,
                avatar: referrer.avatar ?? null,
            },
        })
    } catch (err) {
        next(err)
    }
}

export const deleteAccount = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { confirmationText } = req.body as { confirmationText: string }
        if (!confirmationText)
            throw new BadRequestError('Confirmation text is required')
        await Session.findByIdAndUpdate(req.user!.sessionId, {
            isRevoked: true,
        })
        await userService.deleteAccount(
            req.user!._id.toString(),
            confirmationText,
        )
        // res.clearCookie('token')
        sendSuccess(res, {
            message: 'Your account has been permanently deleted.',
        })
    } catch (err) {
        next(err)
    }
}
