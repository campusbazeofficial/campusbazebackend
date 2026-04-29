import mongoose, { Schema, Document } from 'mongoose'
import {
    SERVICE_CATEGORY,
    LISTING_STATUS,
    type ServiceCategory,
    type ListingStatus,
} from '../utils/constant.js'

// ─── Pricing tier subdocument ─────────────────────────────────────────────────

export interface IServiceTier {
    name: 'starter' | 'standard' | 'premium'
    price: number // NGN
    deliveryDays: number
    description: string
    revisions: number
}

const serviceTierSchema = new Schema<IServiceTier>(
    {
        name: {
            type: String,
            enum: ['starter', 'standard', 'premium'],
            required: true,
        },
        price: { type: Number, required: true, min: 0 },
        deliveryDays: { type: Number, required: true, min: 1 },
        description: { type: String, required: true, maxlength: 500 },
        revisions: { type: Number, default: 1, min: 0 },
    },
    { _id: false },
)

// ─── Service listing ──────────────────────────────────────────────────────────

export interface IServiceListing extends Document {
    _id: mongoose.Types.ObjectId
    sellerId: mongoose.Types.ObjectId
    title: string
    description: string
    category: ServiceCategory
    tiers: IServiceTier[]
    tags: string[]
    portfolioUrls: string[]
    status: ListingStatus
     sellerSubscriptionWeight:number
    // Stats (denormalised for perf)
    totalOrders: number
    averageRating: number
    totalReviews: number
    impressions: number

    createdAt: Date
    updatedAt: Date
}

const serviceListingSchema = new Schema<IServiceListing>(
    {
        sellerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, maxlength: 3000 },
        category: {
            type: String,
            enum: Object.values(SERVICE_CATEGORY),
            required: true,
            index: true,
        },
        tiers: {
            type: [serviceTierSchema],
            validate: {
                validator: (v: IServiceTier[]) => v.length >= 1,
                message: 'At least one pricing tier is required',
            },
        },
        tags: { type: [String], default: [] },
        portfolioUrls: { type: [String], default: [] },
        status: {
            type: String,
            enum: Object.values(LISTING_STATUS),
            default: LISTING_STATUS.DRAFT,
        },
        sellerSubscriptionWeight: { type: Number, default: 0 },
        totalOrders: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0, min: 0, max: 5 },
        totalReviews: { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },
    },
    { timestamps: true },
)

serviceListingSchema.index({ sellerId: 1, status: 1 })
serviceListingSchema.index({ status: 1, category: 1 })
serviceListingSchema.index({ status: 1, averageRating: -1 })
serviceListingSchema.index({ createdAt: -1 })

// Text search index for title + description
serviceListingSchema.index({ title: 'text', description: 'text', tags: 'text' })

const ServiceListing = mongoose.model<IServiceListing>(
    'ServiceListing',
    serviceListingSchema,
)
export default ServiceListing
