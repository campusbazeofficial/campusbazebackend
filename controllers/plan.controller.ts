import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { PlanService } from '../services/plan.service.js'
import { validate } from '../middlewares/validate.js'
import { sendSuccess, sendCreated } from '../utils/response.js'
import { parsePaginationQuery } from '../utils/paginate.js'
import { SUBSCRIPTION_TIER } from '../utils/constant.js'

const planService = new PlanService()

const featuresSchema = z
    .object({
        profileHighlight: z.boolean().optional(),
        priorityListings: z.boolean().optional(),
        featuredBadge: z.boolean().optional(),
        interviewTools: z.boolean().optional(),
        dedicatedSupport: z.boolean().optional(),
        contractModule: z.boolean().optional(),
        analyticsDashboard: z.boolean().optional(),
        unlimitedJobPosts: z.boolean().optional(),
        apiAccess: z.boolean().optional(),
    })
    .optional()

export const createPlanSchema = z.object({
    tier: z.enum(Object.values(SUBSCRIPTION_TIER) as [string, ...string[]]),
    nameLabel: z.string().min(1),
    planType: z.enum(['individual', 'corporate']),

    monthlyNGN: z.number().min(0),
    yearlyNGN: z.number().min(0),

    studentMonthlyNGN: z.number().min(0).optional().default(0),
    studentYearlyNGN: z.number().min(0).optional().default(0),

    monthlyCbc: z.number().min(0).optional(),
    cbcDiscount: z.number().min(0).optional(),

    commissionRate: z.number().min(0),
    studentCommissionRate: z.number().min(0).optional().default(0),

    welcomeBonusCbc: z.number().min(0).optional(),
    benefits: z.array(z.string()).optional().default([]),
    features: featuresSchema,
})

export const updatePlanSchema = createPlanSchema.partial()

export const validateCreatePlan = validate(createPlanSchema)
export const validateUpdatePlan = validate(updatePlanSchema)

// ─── Plan Handlers ───────────────────────────────────────────────────────────

// Create Plan
export const createPlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const plan = await planService.createPlan(req.body)
        sendCreated(res, plan)
    } catch (err) {
        next(err)
    }
}

// Get Plans (paginated optional)
export const getPlans = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { page, limit } = parsePaginationQuery(
            req.query as Record<string, string>,
        )

        const result = await planService.getPlans(page, limit)

        res.json({
            success: true,
            data: result.plans,
            meta: result.meta,
        })
    } catch (err) {
        next(err)
    }
}

// Get Single Plan
export const getPlanById = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const plan = await planService.getPlanById(req.params.id as string)
        sendSuccess(res, plan)
    } catch (err) {
        next(err)
    }
}

// Update Plan
export const updatePlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const plan = await planService.updatePlan(
            req.params.id as string,
            req.body,
        )
        sendSuccess(res, plan)
    } catch (err) {
        next(err)
    }
}

// Delete Plan (⚠️ consider soft delete instead)
export const deletePlan = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        await planService.deletePlan(req.params.id as string)
        sendSuccess(res, { message: 'Plan deleted' })
    } catch (err) {
        next(err)
    }
}

// Toggle Plan Active/Inactive
export const togglePlanStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const result = await planService.togglePlanStatus(
            req.params.id as string,
        )

        sendSuccess(res, {
            message: result.isActive ? 'Plan enabled' : 'Plan disabled',
            isActive: result.isActive,
        })
    } catch (err) {
        next(err)
    }
}
