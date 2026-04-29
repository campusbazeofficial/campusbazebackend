import mongoose, { Schema, Document } from 'mongoose'
import { VERIFICATION_STATUS } from '../utils/constant.js'

export interface ICompany extends Document {
    _id: mongoose.Types.ObjectId
    name: string
    email: string
    phone?: string
    logo?: string
    logoPublicId?: string
    description?: string
    website?: string
    rcNumber?: string // CAC registration number
    industry?: string
    address?: string
    country: string
    state?: string

    ownerId: mongoose.Types.ObjectId
    verificationStatus: string
    verificationBadge: boolean

    isActive: boolean
    isSuspended: boolean

    totalOrdersCompleted: number
    averageRating: number
    totalReviews: number

    createdAt: Date
    updatedAt: Date
}

const companySchema = new Schema<ICompany>(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        phone: { type: String, trim: true },
        logo: { type: String },
        logoPublicId: { type: String, select: false },
        description: { type: String, maxlength: 1000 },
        website: { type: String, trim: true },
        rcNumber: { type: String, trim: true },
        industry: { type: String, trim: true },
        address: { type: String, trim: true },
        country: { type: String, default: 'Nigeria' },
        state: { type: String, trim: true },

        ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        verificationStatus: {
            type: String,
            enum:Object.values(VERIFICATION_STATUS),
            default: VERIFICATION_STATUS.UNVERIFIED,
        },
        verificationBadge: { type: Boolean, default: false },

        isActive: { type: Boolean, default: true },
        isSuspended: { type: Boolean, default: false },

        totalOrdersCompleted: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0, min: 0, max: 5 },
        totalReviews: { type: Number, default: 0 },
    },
    { timestamps: true, toJSON: { virtuals: true } },
)


companySchema.index({ email: 1 }, { unique: true })
companySchema.index({ verificationStatus: 1 })

const Company = mongoose.model<ICompany>('Company', companySchema)
export default Company
