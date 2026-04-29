import mongoose, { Schema, Document } from 'mongoose'
import { VERIFICATION_STATUS } from '../utils/constant.js'

export const VERIFICATION_DOC_TYPE = {
    STUDENT_ID: 'student_id',
    NATIONAL_ID: 'national_id',
    NIN: 'nin',
    PASSPORT: 'passport',
    VOTERS_CARD: 'voters_card',
    FACIAL: 'facial',
    CAC: 'cac',
    DIRECTOR_ID: 'director_id',
} as const

export type VerificationDocType =
    (typeof VERIFICATION_DOC_TYPE)[keyof typeof VERIFICATION_DOC_TYPE]

export interface IVerification extends Document {
    _id: mongoose.Types.ObjectId
    userId: mongoose.Types.ObjectId
    companyId?: mongoose.Types.ObjectId
    docType: VerificationDocType
    documentUrl: string
    documentPublicId: string
    status: string
    adminNote?: string
    reviewedBy?: mongoose.Types.ObjectId
    submittedAt: Date
    reviewedAt?: Date
    documentResourceType: 'image' | 'raw'
    extractedName?: string
    extractedIdNo?: string
    extractedDob?: string
    extractedInstitution?: string
    extractedExpiry?: string
    aiConfidenceScore?: number
    aiFlaggedForReview: boolean

    createdAt: Date
    updatedAt: Date
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const verificationSchema = new Schema<IVerification>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        companyId: {
            type: Schema.Types.ObjectId,
            ref: 'Company',
            sparse: true,
        },
        docType: {
            type: String,
            enum: Object.values(VERIFICATION_DOC_TYPE),
            required: true,
        },
        documentUrl: { type: String, required: true },
        documentPublicId: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(VERIFICATION_STATUS),
            default: VERIFICATION_STATUS.PENDING,
            index: true,
        },
        adminNote: { type: String, maxlength: 500 },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        submittedAt: { type: Date, default: () => new Date() },
        reviewedAt: { type: Date },
        extractedName: { type: String },
        extractedIdNo: { type: String },
        extractedDob: { type: String },
        extractedInstitution: { type: String },
        extractedExpiry: { type: String },
        aiConfidenceScore: { type: Number, min: 0, max: 1 },
        aiFlaggedForReview: { type: Boolean, default: false },
        documentResourceType: {
            type: String,
            enum: ['image', 'raw'],
            default: 'image',
        },
    },
    { timestamps: true },
)

verificationSchema.index(
    { userId: 1, docType: 1, status: 1 },
    {
        unique: false,
        partialFilterExpression: {
            status: {
                $in: [
                    VERIFICATION_STATUS.PENDING,
                    VERIFICATION_STATUS.VERIFIED,
                ],
            },
        },
    },
)

verificationSchema.index({ status: 1, createdAt: -1 })
verificationSchema.index({ aiFlaggedForReview: 1 })

const Verification = mongoose.model<IVerification>(
    'Verification',
    verificationSchema,
)
export default Verification
