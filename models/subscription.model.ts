import mongoose, { Schema, Document } from 'mongoose'
import {
    SUBSCRIPTION_STATUS,
    SUBSCRIPTION_TIER,
    type SubscriptionStatus,
    type SubscriptionTier,
} from '../utils/constant.js'

export type BillingPeriod = 'monthly' | 'yearly'

export interface ISubscription extends Document {
    _id: mongoose.Types.ObjectId
    userId: mongoose.Types.ObjectId
    tier: SubscriptionTier
    billingPeriod: BillingPeriod
    status: SubscriptionStatus
    priceNGN: number

    // Paystack
    paystackReference?: string // charge reference (first payment + renewals)
    paystackAuthCode?: string // authorization_code — used for recurring charges
    paystackCustomerEmail?: string // needed to charge the saved card
    paidAt?: Date

    startsAt: Date
    expiresAt: Date
    nextBillingDate?: Date // set after activation, used by renewal cron
    autoRenew: boolean // user can turn off to prevent renewal
    // subscription.model.ts — update planSnapshot

    planSnapshot: {
        nameLabel: { type: String; required: true }
        monthlyCbc: { type: Number; default: 0 }
        cbcDiscount: { type: Number; default: 0 }
        commissionRate: { type: Number }
        studentCommissionRate: { type: Number }
        welcomeBonusCbc: { type: Number }
        monthlyNGN: { type: Number }
        yearlyNGN: { type: Number }
        studentMonthlyNGN: { type: Number }
        studentYearlyNGN: { type: Number }
        benefits: { type: [String]; default: [] } // ADD
        features: {
            profileHighlight: { type: Boolean; default: false }
            priorityListings: { type: Boolean; default: false }
            featuredBadge: { type: Boolean; default: false }
            interviewTools: { type: Boolean; default: false }
            dedicatedSupport: { type: Boolean; default: false }
            contractModule: { type: Boolean; default: false }
            analyticsDashboard: { type: Boolean; default: false }
            unlimitedJobPosts: { type: Boolean; default: false }
            apiAccess: { type: Boolean; default: false }
        }
    }
    // Cancellation
    cancelledAt?: Date
    cancellationNote?: string
    lastCbcCreditedAt: Date
    createdAt: Date
    updatedAt: Date
}

const subscriptionSchema = new Schema<ISubscription>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        tier: {
            type: String,
            enum: Object.values(SUBSCRIPTION_TIER),
            required: true,
        },
        billingPeriod: {
            type: String,
            enum: ['monthly', 'yearly'],
            required: true,
            default: 'monthly',
        },
        status: {
            type: String,
            enum: Object.values(SUBSCRIPTION_STATUS),
            default: SUBSCRIPTION_STATUS.PENDING,
        },
        priceNGN: { type: Number, required: true, min: 0 },

        paystackReference: { type: String },
        paystackAuthCode: { type: String, select: false }, // sensitive — never return to client
        paystackCustomerEmail: { type: String },
        paidAt: { type: Date },

        planSnapshot: {
            nameLabel: { type: String, required: true },
            monthlyCbc: { type: Number, default: 0 },
            cbcDiscount: { type: Number, default: 0 },
            commissionRate: { type: Number },
            studentCommissionRate: { type: Number },
            welcomeBonusCbc: { type: Number },
            monthlyNGN: { type: Number },
            yearlyNGN: { type: Number },
            studentMonthlyNGN: { type: Number },
            studentYearlyNGN: { type: Number },
            benefits: { type: [String], default: [] }, // ADD
            features: {
                profileHighlight: { type: Boolean, default: false },
                priorityListings: { type: Boolean, default: false },
                featuredBadge: { type: Boolean, default: false },
                interviewTools: { type: Boolean, default: false },
                dedicatedSupport: { type: Boolean, default: false },
                contractModule: { type: Boolean, default: false },
                analyticsDashboard: { type: Boolean, default: false },
                unlimitedJobPosts: { type: Boolean, default: false },
                apiAccess: { type: Boolean, default: false },
            },
        },
        startsAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
        nextBillingDate: { type: Date },
        autoRenew: { type: Boolean, default: true },

        cancelledAt: { type: Date },
        cancellationNote: { type: String, maxlength: 500 },
        lastCbcCreditedAt: { type: Date, default: null },
    },
    { timestamps: true },
)

subscriptionSchema.index({ userId: 1, status: 1 })
subscriptionSchema.index({ expiresAt: 1 })
subscriptionSchema.index({ nextBillingDate: 1, autoRenew: 1, status: 1 }) // renewal cron query
subscriptionSchema.index({ paystackReference: 1 }, { sparse: true })

const Subscription = mongoose.model<ISubscription>(
    'Subscription',
    subscriptionSchema,
)
export default Subscription
