import { BaseService } from './base.service.js'
import planModel, { type PlanType } from '../models/plan.model.js'
import { NotFoundError, ConflictError } from '../utils/appError.js'

type CreatePlanInput = {
    tier: string
    nameLabel: string
    planType: PlanType

    monthlyNGN: number
    yearlyNGN: number
    studentMonthlyNGN: number
    studentYearlyNGN: number

    monthlyCbc?: number
    cbcDiscount?: number

    commissionRate: number
    studentCommissionRate: number
    welcomeBonusCbc?: number

    benefits?: string[]
    features?: {
        profileHighlight?: boolean
        priorityListings?: boolean
        featuredBadge?: boolean
        interviewTools?: boolean
        dedicatedSupport?: boolean
        contractModule?: boolean
        analyticsDashboard?: boolean
        unlimitedJobPosts?: boolean
        apiAccess?: boolean
    }
}

type UpdatePlanInput = Partial<CreatePlanInput> & {
    isActive?: boolean
}

export class PlanService extends BaseService {
    async createPlan(data: CreatePlanInput) {
        const existing = await planModel.findOne({ tier: data.tier })
        if (existing)
            throw new ConflictError('Plan with this tier already exists')

        return planModel.create(data)
    }

    async getPlans(page = 1, limit = 10) {
        const skip = (page - 1) * limit

        const [plans, total] = await Promise.all([
            planModel
                .find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            planModel.countDocuments(),
        ])

        return {
            plans,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        }
    }

    async getPlanById(id: string) {
        const plan = await planModel.findById(id)
        if (!plan) throw new NotFoundError('Plan')
        return plan
    }

    async updatePlan(id: string, data: UpdatePlanInput) {
        const plan = await planModel.findById(id)
        if (!plan) throw new NotFoundError('Plan')

        // prevent accidental tier change collisions
        if (data.tier && data.tier !== plan.tier) {
            const exists = await planModel.findOne({ tier: data.tier })
            if (exists) throw new ConflictError('Tier already exists')
        }

        Object.assign(plan, data)
        await plan.save()

        return plan
    }

    async deletePlan(id: string) {
        const plan = await planModel.findByIdAndDelete(id)
        if (!plan) throw new NotFoundError('Plan')
        return { message: 'Plan deleted' }
    }

    async togglePlanStatus(id: string) {
        const plan = await planModel.findById(id)
        if (!plan) throw new NotFoundError('Plan')

        plan.isActive = !plan.isActive
        await plan.save()

        return plan
    }
}
