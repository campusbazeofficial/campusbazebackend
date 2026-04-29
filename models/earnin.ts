import mongoose, { Schema, Document } from 'mongoose'

export const CLEARANCE_STATUS = {
    PENDING:  'pending',   // waiting for admin approval
    APPROVED: 'approved',  // admin approved — earnings credited to wallet
    REJECTED: 'rejected',  // admin rejected — earnings not credited
PROCESSING:'processing'
} as const

export type ClearanceStatus = typeof CLEARANCE_STATUS[keyof typeof CLEARANCE_STATUS]

export const CLEARANCE_SOURCE = {
    ERRAND: 'errand',
    ORDER:  'order',
} as const

export type ClearanceSource = typeof CLEARANCE_SOURCE[keyof typeof CLEARANCE_SOURCE]

export interface IEarningsClearance extends Document {
    _id:          mongoose.Types.ObjectId
    userId:       mongoose.Types.ObjectId   // the earner (runner/seller)
    sourceType:   ClearanceSource
    sourceId:     mongoose.Types.ObjectId   // errandId or orderId
    amountNGN:    number
    status:       ClearanceStatus
    adminNote?:   string
    reviewedBy?:  mongoose.Types.ObjectId
    reviewedAt?:  Date
    createdAt:    Date
    updatedAt:    Date
   clearAt: Date,
}

const earningsClearanceSchema = new Schema<IEarningsClearance>(
    {
        userId:     { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
        sourceType: { type: String, enum: Object.values(CLEARANCE_SOURCE), required: true },
        sourceId:   { type: Schema.Types.ObjectId, required: true },
        amountNGN:  { type: Number, required: true, min: 0 },
        status:     {
            type:    String,
            enum:    Object.values(CLEARANCE_STATUS),
            default: CLEARANCE_STATUS.PENDING,
            index:   true,
        },
        adminNote:  { type: String, maxlength: 500 },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        clearAt: { type: Date },
    },
    { timestamps: true }
)

earningsClearanceSchema.index({ status: 1, createdAt: -1 })
earningsClearanceSchema.index({ sourceId: 1 }, { unique: true }) // one clearance per errand/order

const EarningsClearance = mongoose.model<IEarningsClearance>('EarningsClearance', earningsClearanceSchema)
export default EarningsClearance