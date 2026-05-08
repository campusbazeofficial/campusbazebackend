import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ErrandService } from '../services/errand.service.js'
import { validate } from '../middlewares/validate.js'
import { upload } from '../middlewares/upload.js'
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response.js'
import { parsePaginationQuery } from '../utils/paginate.js'
import { ERRAND_CATEGORY } from '../utils/constant.js'
import { SkillService } from '../services/skill.service.js'
import { BadRequestError, ConflictError, ValidationError } from '../utils/appError.js'
import { locationSchema } from './auth.controller.js'

const errandService = new ErrandService()
const skillService = new SkillService()
// ─── Validation schemas ───────────────────────────────────────────────────────

export const postErrandSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(120),
    description: z
        .string()
        .min(10, 'Description must be at least 10 characters')
        .max(2000),
    category: z.enum(Object.values(ERRAND_CATEGORY) as [string, ...string[]]),
    budgetType: z.enum(['fixed', 'negotiable']),
    budget: z.number().positive('Budget must be a positive number'),
    address: z.string().min(5).max(300),
    deadline: z
        .string()
        .datetime({ message: 'Deadline must be a valid ISO datetime' }),
    location: locationSchema,
})

export const placeBidSchema = z.object({
    amount: z.number().positive('Bid amount must be positive'),
    message: z.string().max(500).optional(),
})

export const completeErrandSchema = z.object({
    note: z.string().max(500).optional(),
})

export const disputeErrandSchema = z.object({
    reason: z
        .string()
        .min(10, 'Please describe the issue in at least 10 characters')
        .max(1000),
})

export const extendErrandDeadlineSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be in HH:MM format'),
})

export const browseErrandsSchema = z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    maxBudget: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
})

// ─── Middleware exports ───────────────────────────────────────────────────────

export const validatePostErrand = validate(postErrandSchema)
export const validatePlaceBid = validate(placeBidSchema)
export const validateCompleteErrand = validate(completeErrandSchema)
export const validateDisputeErrand = validate(disputeErrandSchema)
export const validateExtendErrandDeadline = validate(extendErrandDeadlineSchema)
export const validateBrowseErrands = validate(browseErrandsSchema, 'query')

// Multer for completion proof (image or PDF)
export const proofUpload = upload.single('proof')

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const postErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const dto = {
            ...(req.body as z.infer<typeof postErrandSchema>),
            deadline: new Date(req.body.deadline as string),
        }
        const errand = await errandService.postErrand(
            req.user!._id.toString(),
            dto,
        )
        sendCreated(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const browseErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const pagination = parsePaginationQuery(
            req.query as Record<string, string>,
        )
        const result = await errandService.browseErrands({
            ...pagination,
            category: req.query.category as string | undefined,
            status: req.query.status as string | undefined,
            maxBudget: req.query.maxBudget
                ? Number(req.query.maxBudget)
                : undefined,
        })
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const myPostedErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myPostedErrands(
            req.user!._id.toString(),
            opts,
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const myRunningErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myRunningErrands(
            req.user!._id.toString(),
            opts,
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}
export const myInProgressErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myInProgressErrands(
            req.user!._id.toString(),
            opts,
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const myAcceptedErrands = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myAcceptedErrands(
            req.user!._id.toString(),
            opts,
        )
        sendPaginated(res, result)
    } catch (err) {
        next(err)
    }
}

export const myAcceptedBids = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myAcceptedBids(
            req.user!._id.toString(),
            opts,
        )
        res.json({ success: true, data: result.data, meta: result.meta })
    } catch (err) {
        next(err)
    }
}

export const getErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.getErrand(
            req.params.errandId as string,
            req.user?.id,
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const myBids = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const opts = parsePaginationQuery(req.query as Record<string, string>)
        const result = await errandService.myBids(
            req.user!._id.toString(),
            opts,
        )
        res.json({ success: true, data: result.data, meta: result.meta })
    } catch (err) {
        next(err)
    }
}

export const placeBid = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { amount, message } = req.body as {
            amount: number
            message?: string
        }
        const errand = await errandService.placeBid(
            req.params.errandId as string,
            req.user!._id.toString(),
            amount,
            message,
        )
        sendCreated(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const withdrawBid = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.withdrawBid(
            req.params.errandId as string,
            req.params.bidId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const acceptBid = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await errandService.acceptBid(
            req.params.errandId as string,
            req.params.bidId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}

export const startErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.startErrand(
            req.params.errandId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const completeErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.completeErrand(
            req.params.errandId as string,
            req.user!._id.toString(),
            req.body.note as string | undefined,
            req.file?.buffer,
            req.file?.mimetype,
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const confirmErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.confirmErrand(
            req.params.errandId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const cancelErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.cancelErrand(
            req.params.errandId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const disputeErrand = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const errand = await errandService.disputeErrand(
            req.params.errandId as string,
            req.user!._id.toString(),
            (req.body as { reason: string }).reason,
        )
        sendSuccess(res, { errand })
    } catch (err) {
        next(err)
    }
}

export const payForErrand = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new ConflictError('No user found for this payment')
    }

    const { id, email } = req.user

    const payment = await errandService.initiateEscrowPayment(
        id,
        req.params.errandId as string,
        email,
    )

    res.json({
        success: true,
        data: payment,
    })
}

export const getErrandMatches = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const limit   = req.query.limit ? Number(req.query.limit) : 10
    const matches = await skillService.matchRunnersForErrand(
      req.params.errandId as string,
      limit
    )
    sendSuccess(res, { matches, total: matches.length })
  } catch (err) { next(err) }
}

export const extendErrandDeadline = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { date, time } = req.body
        const newDeadline = new Date(`${date}T${time}:00.000Z`)

        if (isNaN(newDeadline.getTime())) {
            throw new ValidationError('Invalid date or time provided')
        }
        if (newDeadline <= new Date()) {
            throw new ValidationError('New deadline must be in the future')
        }

        const result = await errandService.extendErrandDeadline(
            req.user!._id.toString(),
            req.params.errandId as string,
            newDeadline,
        )
        sendSuccess(res, result)
    } catch (err) {
        next(err)
    }
}