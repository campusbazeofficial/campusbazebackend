import mongoose, { Schema, Document } from 'mongoose'
import {
    ERRAND_CATEGORY,
    ERRAND_STATUS,
    BID_STATUS,
    type ErrandCategory,
    type ErrandStatus,
    type BidStatus,
} from '../utils/constant.js'

// ─── Embedded bid subdocument ─────────────────────────────────────────────────

export interface IBid {
    _id: mongoose.Types.ObjectId
    runnerId: mongoose.Types.ObjectId
    amount: number
    message?: string
    status: BidStatus
    createdAt: Date
}

const bidSchema = new Schema<IBid>(
    {
        runnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true, min: 0 },
        message: { type: String, maxlength: 500 },
        status: {
            type: String,
            enum: Object.values(BID_STATUS),
            default: BID_STATUS.PENDING,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false }, _id: true },
)

// ─── Errand ───────────────────────────────────────────────────────────────────

export interface IErrand extends Document {
    _id: mongoose.Types.ObjectId
    posterId: mongoose.Types.ObjectId
    title: string
    description: string
    category: ErrandCategory
    budgetType: 'fixed' | 'negotiable'
    budget: number
    address: string
    deadline: Date
    status: ErrandStatus
    location: {
        state: string
        localGovt: string
        village?: string
    }

    runnerId?: mongoose.Types.ObjectId
    acceptedBidId?: mongoose.Types.ObjectId
    bids: IBid[]

    completionProofUrl?: string
    completionProofPublicId?: string
    completionNote?: string
    disputeReason?: string
    disputeNote?: string // admin resolution note
    disputeResolvedBy?: mongoose.Types.ObjectId // admin user id
    bidsCount: number
    paymentProvider: string
    paymentReference: string
    paymentCaptured: boolean

    escrowReference?: string
    escrowConfirmed: boolean
    cbcFeeCharged: number
    earningRejected?: boolean
    earningRejectedReason?: string
    earningRejectedAt?: Date
    agreedAmount?: number
    commissionRate?: number
    commissionNGN?: number
    sellerEarningsNGN?: number
    posterSubscriptionWeight?: number
    reviewId?: mongoose.Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const errandSchema = new Schema<IErrand>(
    {
        posterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, maxlength: 2000 },
        category: {
            type: String,
            enum: Object.values(ERRAND_CATEGORY),
            required: true,
        },
        budgetType: {
            type: String,
            enum: ['fixed', 'negotiable'],
            required: true,
        },
        budget: { type: Number, required: true, min: 0 },
        address: { type: String, required: true, maxlength: 300 },
        deadline: { type: Date, required: true },
        posterSubscriptionWeight: { type: Number, default: 0 },
        status: {
            type: String,
            enum: Object.values(ERRAND_STATUS),
            default: ERRAND_STATUS.POSTED,
        },
        earningRejected: { type: Boolean, default: false },
        earningRejectedReason: { type: String, maxlength: 500 },
        earningRejectedAt: { type: Date },
        runnerId: { type: Schema.Types.ObjectId, ref: 'User' },
        acceptedBidId: { type: Schema.Types.ObjectId },
        bids: { type: [bidSchema], default: [] },
        bidsCount: { type: Number, default: 0 },
        paymentProvider: { type: String, default: 'paystack' },
        paymentReference: { type: String },
        paymentCaptured: { type: Boolean, default: false },
        completionProofUrl: { type: String },
        completionProofPublicId: { type: String },
        completionNote: { type: String, maxlength: 500 },
        disputeReason: { type: String, maxlength: 1000 },
        disputeNote: { type: String, maxlength: 1000 },
        disputeResolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        location: {
            state: { type: String, required: true, trim: true },
            localGovt: { type: String, required: true, trim: true },
            village: { type: String, trim: true },
        },
        escrowReference: { type: String },
        escrowConfirmed: { type: Boolean, default: false },
        cbcFeeCharged: { type: Number, default: 0 },

        agreedAmount: { type: Number },
        commissionRate: { type: Number },
        commissionNGN: { type: Number },
        sellerEarningsNGN: { type: Number },

        reviewId: { type: Schema.Types.ObjectId, ref: 'Review' },
    },
    { timestamps: true },
)

errandSchema.index({ posterId: 1, status: 1 })
errandSchema.index({ runnerId: 1, status: 1 })
errandSchema.index({ status: 1, category: 1 })
errandSchema.index({ status: 1, createdAt: -1 })
errandSchema.index({ escrowReference: 1 }, { sparse: true })
errandSchema.index({ 'location.state': 1, 'location.localGovt': 1, status: 1 })

const Errand = mongoose.model<IErrand>('Errand', errandSchema)
export default Errand
