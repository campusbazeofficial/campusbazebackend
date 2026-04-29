import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Subscription, {
    type BillingPeriod,
} from '../models/subscription.model.js'
import User from '../models/user.model.js'
import {
    SUBSCRIPTION_STATUS,
    SUBSCRIPTION_TIER,
    NOTIFICATION_TYPE,
    type SubscriptionTier,
    USER_ROLE,
} from '../utils/constant.js'
import {
    initializeTransaction,
    chargeAuthorization,
    generateReference,
} from '../utils/paystack.js'
import {
    ValidationError,
    NotFoundError,
    ConflictError,
} from '../utils/appError.js'
import { NotificationService } from './notification.service.js'
import planModel from '../models/plan.model.js'
import { CbcService } from './cbc.service.js'
import { WALLET_TX_TYPE } from '../models/wallet.model.js'
import {
    assertEligibleForTier,
    getSubscriptionWeight,
} from '../utils/helper.js'

const notificationService = new NotificationService()
const cbcService = new CbcService()
// ───────────────── helpers ─────────────────

async function resolvePrice(
    tier: SubscriptionTier,
    billingPeriod: BillingPeriod,
    userId: string, // ADD — needed to check verified status
): Promise<number> {
    const [plan, user] = await Promise.all([
        planModel.findOne({ tier, isActive: true }),
        User.findById(userId).select('isStudentVerified').lean(),
    ])
    if (!plan) throw new ValidationError('Invalid subscription tier')

    const isVerifiedStudent = user?.isStudentVerified ?? false

    return billingPeriod === 'monthly'
        ? isVerifiedStudent
            ? plan.studentMonthlyNGN
            : plan.monthlyNGN
        : isVerifiedStudent
          ? plan.studentYearlyNGN
          : plan.yearlyNGN
}

function resolveExpiry(billingPeriod: BillingPeriod): Date {
    return billingPeriod === 'monthly'
        ? dayjs().add(1, 'month').toDate()
        : dayjs().add(1, 'year').toDate()
}

// ───────────────── service ─────────────────

export class SubscriptionService extends BaseService {
    async getPlans(userId: string) {
        const user = await User.findById(userId)
            .select('role isStudentVerified identityVerificationLevel')
            .lean()
        if (!user) throw new NotFoundError('User')

        const isCorporateUser = user.role === USER_ROLE.CORPORATE
        const plans = await planModel.find({ isActive: true }).lean()

        return plans.map((plan) => {
            const isCorporatePlan = plan.planType === 'corporate'

            // ── Reasons this plan is not available to this user ───────────────
            let ineligibleReason: string | null = null

            if (isCorporatePlan && !isCorporateUser) {
                ineligibleReason = 'Available for corporate accounts only'
            } else if (!isCorporatePlan && isCorporateUser) {
                ineligibleReason = 'Available for individual accounts only'
            } else if (plan.tier === SUBSCRIPTION_TIER.ELITE) {
                if ((user.identityVerificationLevel ?? 0) < 2) {
                    ineligibleReason =
                        'Requires Tier 2 verification (phone + identity document)'
                }
            }

            return {
                tier: plan.tier,
                nameLabel: plan.nameLabel,
                planType: plan.planType,

                // subscription.service.ts

                pricing: {
                    standard: {
                        monthlyNGN: plan.monthlyNGN,
                        yearlyNGN: plan.yearlyNGN,
                    },
                    // only include student pricing for individual plans
                    ...(plan.planType === 'individual' && {
                        student: {
                            monthlyNGN: plan.studentMonthlyNGN,
                            yearlyNGN: plan.studentYearlyNGN,
                        },
                    }),
                },

                commission: {
                    standard: plan.commissionRate,
                    ...(plan.planType === 'individual' && {
                        student: plan.studentCommissionRate,
                    }),
                },

                cbc: {
                    monthly: plan.monthlyCbc,
                    discount: plan.cbcDiscount,
                    welcomeBonus: plan.welcomeBonusCbc,
                },

                features: plan.features,
                benefits: plan.benefits,

                // ── Frontend uses these two fields ────────────────────────────
                eligible: ineligibleReason === null,
                ineligibleReason, // null = eligible

                yearlySavingPct:
                    plan.monthlyNGN > 0
                        ? Math.round(
                              (1 - plan.yearlyNGN / (plan.monthlyNGN * 12)) *
                                  100,
                          )
                        : 0,
            }
        })
    }
    async getMine(userId: string) {
        const user = await User.findById(userId)
            .select(
                'subscriptionTier subscriptionExpiresAt isStudent isStudentVerified ' +
                    'role identityVerificationLevel identityVerificationBadge subscriptionWeight',
            )
            .lean()
        if (!user) throw new NotFoundError('User')

        const active = await Subscription.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            status: SUBSCRIPTION_STATUS.ACTIVE,
        })
            .sort({ expiresAt: -1 })
            .select('-paystackAuthCode')
            .lean()

        const isFree =
            user.subscriptionTier === SUBSCRIPTION_TIER.FREE ||
            user.subscriptionTier === SUBSCRIPTION_TIER.CORPORATE_FREE

        const daysUntilExpiry = active?.expiresAt
            ? dayjs(active.expiresAt).diff(dayjs(), 'day')
            : null

        return {
            // ── Plan identity ─────────────────────────────────────────────────
            currentTier: user.subscriptionTier,
            nameLabel: active?.planSnapshot?.nameLabel ?? user.subscriptionTier,
            billingPeriod: active?.billingPeriod ?? null,

            // ── Status ────────────────────────────────────────────────────────
            isActive: isFree || !!active,
            isFree,
            autoRenew: active?.autoRenew ?? false,

            // ── Dates ─────────────────────────────────────────────────────────
            startedAt: active?.startsAt ?? null,
            expiresAt: active?.expiresAt ?? user.subscriptionExpiresAt ?? null,
            nextBillingDate: active?.nextBillingDate ?? null,
            paidAt: active?.paidAt ?? null,
            daysUntilExpiry,
            isExpiringSoon: daysUntilExpiry !== null && daysUntilExpiry <= 7,

            // ── Pricing ───────────────────────────────────────────────────────
            priceNGN: active?.priceNGN ?? 0,
            pricing: {
                monthlyNGN: active?.planSnapshot?.monthlyNGN ?? 0,
                yearlyNGN: active?.planSnapshot?.yearlyNGN ?? 0,
                studentMonthlyNGN: active?.planSnapshot?.studentMonthlyNGN ?? 0,
                studentYearlyNGN: active?.planSnapshot?.studentYearlyNGN ?? 0,
            },

            // ── CBC ───────────────────────────────────────────────────────────
            cbc: {
                monthlyAllocation: active?.planSnapshot?.monthlyCbc ?? 0,
                discount: active?.planSnapshot?.cbcDiscount ?? 0,
            },

            // ── Commission ────────────────────────────────────────────────────
            commission: {
                rate: user.isStudentVerified
                    ? (active?.planSnapshot?.studentCommissionRate ?? null)
                    : (active?.planSnapshot?.commissionRate ?? null),
                isStudentRate: user.isStudentVerified,
            },

            // ── What's included in this plan ──────────────────────────────────
            features: active?.planSnapshot?.features ?? null,
            benefits: active?.planSnapshot?.benefits ?? [],

            // ── Verification context ──────────────────────────────────────────
            verification: {
                level: user.identityVerificationLevel ?? 0,
                badge: user.identityVerificationBadge,
                isStudentVerified: user.isStudentVerified ?? false,
            },
        }
    }

    async getPublicPlans() {
        const plans = await planModel.find({ isActive: true }).lean()

        return plans.map((plan) => ({
            tier: plan.tier,
            nameLabel: plan.nameLabel,
            planType: plan.planType,

            // subscription.service.ts

            pricing: {
                standard: {
                    monthlyNGN: plan.monthlyNGN,
                    yearlyNGN: plan.yearlyNGN,
                },
                ...(plan.planType === 'individual' && {
                    student: {
                        monthlyNGN: plan.studentMonthlyNGN,
                        yearlyNGN: plan.studentYearlyNGN,
                    },
                }),
            },

            commission: {
                standard: plan.commissionRate,
                ...(plan.planType === 'individual' && {
                    student: plan.studentCommissionRate,
                }),
            },

            cbc: {
                monthly: plan.monthlyCbc,
                discount: plan.cbcDiscount,
                welcomeBonus: plan.welcomeBonusCbc,
            },

            features: plan.features,
            benefits: plan.benefits,

            yearlySavingPct:
                plan.monthlyNGN > 0
                    ? Math.round(
                          (1 - plan.yearlyNGN / (plan.monthlyNGN * 12)) * 100,
                      )
                    : 0,
        }))
    }
    async initializeSubscription(
        userId: string,
        userEmail: string,
        isStudent: boolean,
        tier: SubscriptionTier,
        billingPeriod: BillingPeriod = 'monthly',
        callbackUrl?: string,
    ) {
        await assertEligibleForTier(userId, tier)
        const plan = await planModel.findOne({ tier, isActive: true })
        if (!plan) throw new ValidationError('Plan not found')

        const priceNGN = await resolvePrice(tier, billingPeriod, userId)
        if (priceNGN === 0) {
            throw new ValidationError('Free tier does not require payment')
        }

        const existing = await Subscription.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            tier,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            expiresAt: { $gt: new Date() },
        }).lean()

        if (existing) {
            throw new ConflictError(
                'You already have an active subscription for this tier',
            )
        }

        const reference = generateReference('SUB')
        const expiresAt = resolveExpiry(billingPeriod)

        await Subscription.create({
            userId: new mongoose.Types.ObjectId(userId),
            tier,
            billingPeriod,
            status: SUBSCRIPTION_STATUS.PENDING,
            priceNGN,
            startsAt: new Date(),
            expiresAt,
            paystackReference: reference,
            paystackCustomerEmail: userEmail,

            planSnapshot: {
                nameLabel: plan.nameLabel,
                monthlyCbc: plan.monthlyCbc,
                cbcDiscount: plan.cbcDiscount,
                commissionRate: plan.commissionRate,
                studentCommissionRate: plan.studentCommissionRate,
                welcomeBonusCbc: plan.welcomeBonusCbc,
                monthlyNGN: plan.monthlyNGN,
                yearlyNGN: plan.yearlyNGN,
                studentMonthlyNGN: plan.studentMonthlyNGN,
                studentYearlyNGN: plan.studentYearlyNGN,
                benefits: plan.benefits,
                features: plan.features,
            },
        })

        const paystack = await initializeTransaction(
            userEmail,
            priceNGN,
            reference,
            { userId, type: 'subscription', tier, billingPeriod, priceNGN },
            callbackUrl,
        )
        return {
            ...paystack,
            tier,
            billingPeriod,
            priceNGN,
            nameLabel: plan.nameLabel,
            expiresAt,
        }
    }

    async activateSubscription(
        reference: string,
        userId: string,
        tier: SubscriptionTier,
        authCode?: string,
    ) {
        const session = await mongoose.startSession()
        session.startTransaction()

        let subscription = null

        try {
            subscription = await Subscription.findOneAndUpdate(
                {
                    paystackReference: reference,
                    status: SUBSCRIPTION_STATUS.PENDING,
                },
                {
                    status: SUBSCRIPTION_STATUS.ACTIVE,
                    paidAt: new Date(),
                    ...(authCode && { paystackAuthCode: authCode }),
                },
                { new: true, session },
            )

            if (!subscription) {
                await session.abortTransaction()
                return
            }

            const nextBillingDate =
                subscription.billingPeriod === 'monthly'
                    ? dayjs(subscription.expiresAt).subtract(3, 'day').toDate()
                    : dayjs(subscription.expiresAt).subtract(7, 'day').toDate()

            await Subscription.findByIdAndUpdate(
                subscription._id,
                { nextBillingDate },
                { session },
            )

            await User.findByIdAndUpdate(
                userId,
                {
                    subscriptionTier: tier,
                    subscriptionExpiresAt: subscription.expiresAt,
                    subscriptionWeight: getSubscriptionWeight(tier),
                },
                { session },
            )

            await session.commitTransaction()
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }

        if (!subscription) return

        const period =
            subscription.billingPeriod === 'monthly' ? 'monthly' : 'annual'

        notificationService
            .create({
                userId,
                type: NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED,
                title: 'Subscription activated',
                body: `Your ${subscription.planSnapshot?.nameLabel ?? tier} ${period} plan is now active.`,
            })
            .catch(() => null)
    }

    async renewSubscription(subscriptionId: string) {
        const sub = await Subscription.findById(subscriptionId)
            .select('+paystackAuthCode')
            .lean()

        if (!sub) throw new NotFoundError('Subscription')
        if (!sub.autoRenew) return

        if (!sub.paystackAuthCode || !sub.paystackCustomerEmail) {
            throw new ValidationError('No saved payment method')
        }

        const reference = generateReference('RNW')

        const result = await chargeAuthorization(
            sub.paystackAuthCode,
            sub.paystackCustomerEmail,
            sub.priceNGN,
            reference,
            { userId: sub.userId.toString() },
        )

        if (result.status !== 'success') return

        const newExpiresAt = resolveExpiry(sub.billingPeriod as BillingPeriod)

        await Subscription.findByIdAndUpdate(subscriptionId, {
            expiresAt: newExpiresAt,
            paidAt: new Date(),
            paystackReference: reference,
        })

        await User.findByIdAndUpdate(sub.userId, {
            subscriptionExpiresAt: newExpiresAt,
        })
    }

    async toggleAutoRenew(userId: string): Promise<{ autoRenew: boolean }> {
        const sub = await Subscription.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            status: SUBSCRIPTION_STATUS.ACTIVE,
        })

        if (!sub) throw new NotFoundError('Active subscription')

        sub.autoRenew = !sub.autoRenew
        await sub.save()

        return { autoRenew: sub.autoRenew }
    }

    // ✅ FIXED
    async cancelSubscription(userId: string, note?: string): Promise<void> {
        const subscription = await Subscription.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            status: SUBSCRIPTION_STATUS.ACTIVE,
        })

        if (!subscription) throw new NotFoundError('Active subscription')

        subscription.status = SUBSCRIPTION_STATUS.CANCELLED
        subscription.cancelledAt = new Date()
        subscription.cancellationNote = note
        subscription.autoRenew = false

        await subscription.save()

        await User.findByIdAndUpdate(userId, {
            subscriptionTier: SUBSCRIPTION_TIER.FREE,
        })

        notificationService
            .create({
                userId,
                type: NOTIFICATION_TYPE.SUBSCRIPTION_CANCELLED,
                title: 'Subscription cancelled',
                body: `Your ${subscription.planSnapshot?.nameLabel ?? subscription.tier} plan has been cancelled.`,
            })
            .catch(() => null)
    }

    // ✅ FIXED
    async upgradeSubscription(
        userId: string,
        userEmail: string,
        isStudent: boolean,
        newTier: SubscriptionTier,
        billingPeriod: BillingPeriod = 'monthly',
        callbackUrl?: string,
    ) {
        const current = await Subscription.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            status: SUBSCRIPTION_STATUS.ACTIVE,
        }).lean()

        if (current && current.tier === newTier) {
            throw new ConflictError('You are already on this plan')
        }

        await assertEligibleForTier(userId, newTier)

        const result = await this.initializeSubscription(
            userId,
            userEmail,
            isStudent,
            newTier,
            billingPeriod,
            callbackUrl,
        )

        // ✅ THEN cancel old one
        if (current) {
            await Subscription.findByIdAndUpdate(current._id, {
                status: SUBSCRIPTION_STATUS.CANCELLED,
                cancelledAt: new Date(),
                autoRenew: false,
                cancellationNote: `Switched to ${newTier}`,
            })
        }

        return result
    }
}
