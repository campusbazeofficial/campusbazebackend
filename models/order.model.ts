import mongoose, { Schema, Document } from 'mongoose'
import { ORDER_STATUS, type OrderStatus } from '../utils/constant.js'

export interface IOrder extends Document {
    _id: mongoose.Types.ObjectId
    buyerId: mongoose.Types.ObjectId
    sellerId: mongoose.Types.ObjectId
    listingId: mongoose.Types.ObjectId
    tierName: 'starter' | 'standard' | 'premium'

    // Amounts (NGN)
    amount: number
    commissionRate: number
    commissionNGN: number
    sellerEarningsNGN: number

    status: OrderStatus
    deliveryDue: Date

    // Buyer message at order time
    requirements?: string

    // Paystack escrow
    escrowReference?: string
    escrowConfirmed: boolean

    // Delivery
    deliveryNote?: string
    deliveredAt?: Date
    completedAt?: Date

    // Revision
    revisionCount: number
    revisionNote?: string
    earningRejected?: boolean
    earningRejectedReason?: string
    earningRejectedAt?: Date
    // Dispute
    disputeReason?: string
    disputeNote?: string
    sellerCancelReason: string
    cancelledBySeller: boolean
    disputeResolvedBy?: mongoose.Types.ObjectId
    disputeOpenedBy?: mongoose.Types.ObjectId
    paymentProvider: string
    paymentReference: string
    paymentCaptured: boolean
    // CBC deducted from buyer at contact time
    cbcFeeCharged: number

    reviewId?: mongoose.Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const orderSchema = new Schema<IOrder>(
    {
        buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        listingId: {
            type: Schema.Types.ObjectId,
            ref: 'ServiceListing',
            required: true,
        },
        tierName: {
            type: String,
            enum: ['starter', 'standard', 'premium'],
            required: true,
        },

        amount: { type: Number, required: true, min: 0 },
        commissionRate: { type: Number, required: true },
        commissionNGN: { type: Number, required: true },
        sellerEarningsNGN: { type: Number, required: true },

        status: {
            type: String,
            enum: Object.values(ORDER_STATUS),
            default: ORDER_STATUS.PENDING_PAYMENT,
        },
        deliveryDue: { type: Date, required: true },

        requirements: { type: String, maxlength: 2000 },
        earningRejected: { type: Boolean, default: false },
        earningRejectedReason: { type: String, maxlength: 500 },
        earningRejectedAt: { type: Date },
        escrowReference: { type: String },
        escrowConfirmed: { type: Boolean, default: false },

        deliveryNote: { type: String, maxlength: 2000 },
        deliveredAt: { type: Date },
        completedAt: { type: Date },
        sellerCancelReason: { type: String, maxlength: 1000 },
        cancelledBySeller: { type: Boolean, default: false },
        revisionCount: { type: Number, default: 0 },
        revisionNote: { type: String, maxlength: 1000 },
        paymentProvider: { type: String, default: 'paystack' },
        paymentReference: { type: String },
        paymentCaptured: { type: Boolean, default: false },
        disputeReason: { type: String, maxlength: 1000 },
        disputeNote: { type: String, maxlength: 1000 },
        disputeResolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        disputeOpenedBy: { type: Schema.Types.ObjectId, ref: 'User' },

        cbcFeeCharged: { type: Number, default: 0 },

        reviewId: { type: Schema.Types.ObjectId, ref: 'Review' },
    },
    { timestamps: true },
)

orderSchema.index({ buyerId: 1, status: 1 })
orderSchema.index({ sellerId: 1, status: 1 })
orderSchema.index({ listingId: 1 })
orderSchema.index({ status: 1, createdAt: -1 })
orderSchema.index({ escrowReference: 1 }, { sparse: true })

const Order = mongoose.model<IOrder>('Order', orderSchema)
export default Order
