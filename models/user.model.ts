import mongoose, { Schema, Document, Model, HydratedDocument } from 'mongoose'
import bcrypt from 'bcryptjs'
import slugify from 'slugify'
import {
    IDENTITY_BADGE,
    SUBSCRIPTION_TIER,
    USER_ROLE,
    VERIFICATION_STATUS,
} from '../utils/constant.js'
import { generateUniqueReferralCode } from '../utils/helper.js'

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId

    // Identity
    firstName: string
    lastName: string
    displayName: string
    email: string
    phone?: string
    password: string
    avatar?: string
    avatarPublicId?: string
    bio?: string

    // Role & Type
    role: string
    isStudent: boolean
    isStudentVerified: boolean
    institutionName?: string
    institutionEmail?: string
    yearOfStudy?: number

    // Corporate
    companyId?: mongoose.Types.ObjectId

    // Verification
    isEmailVerified: boolean
    isPhoneVerified: boolean
    identityVerificationStatus: string
    identityVerificationBadge: boolean
    identityVerificationLevel: number
    identityBadge: string
    // Account State
    isActive: boolean
    isSuspended: boolean
    suspendedReason?: string
    lastSeen?: Date
    location?: {
        state: string
        localGovt: string
        village?: string
    }
    // Subscription
    subscriptionTier: string
    subscriptionExpiresAt?: Date

    // Referral
    referralCode: string
    referredBy?: mongoose.Types.ObjectId

    // OTP
    emailOtp?: string | null
    emailOtpExpires?: Date | null

    phoneOtp?: string | null
    phoneOtpExpires?: Date | null

    emailOtpLastSentAt?: Date | null

    emailOtpAttempts?: number

    emailOtpBlockedUntil?: Date | null
    sellerCancelCount: number
    isFlagged: boolean
    passwordResetToken?: string | null
    passwordResetExpires?: Date | null
    slug: string
    // Stats (denormalized for performance)
    totalOrdersCompleted: number
    averageRating: number
    totalReviews: number
    subscriptionWeight: number
    // Timestamps
    createdAt: Date
    updatedAt: Date

    // Methods
    comparePassword(candidatePassword: string): Promise<boolean>
    getPublicProfile(): Partial<IUser>
    isSubscriptionActive(): boolean
}

export type UserDocument = HydratedDocument<IUser>

export interface IUserModel extends Model<IUser> {
    findByEmail(email: string): Promise<UserDocument | null>
}

const userSchema = new Schema<IUser>(
    {
        firstName: { type: String, required: true, trim: true, maxlength: 50 },
        lastName: { type: String, required: true, trim: true, maxlength: 50 },
        displayName: { type: String, trim: true, maxlength: 60 },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        phone: { type: String, trim: true, sparse: true },
        password: { type: String, required: true, select: false, minlength: 8 },
        avatar: { type: String },
        avatarPublicId: { type: String, select: false },
        bio: { type: String, maxlength: 500 },

        role: {
            type: String,
            enum: Object.values(USER_ROLE),
            default: USER_ROLE.STUDENT,
        },
        location: {
            state: { type: String, trim: true },
            localGovt: { type: String, trim: true },
            village: { type: String, trim: true },
        },
        sellerCancelCount: { type: Number, default: 0 },
        isFlagged: { type: Boolean, default: false },
        isStudent: { type: Boolean, default: false },
        isStudentVerified: { type: Boolean, default: false },
        institutionName: { type: String, trim: true },
        institutionEmail: { type: String, lowercase: true, trim: true },
        yearOfStudy: { type: Number, min: 1, max: 10 },

        companyId: { type: Schema.Types.ObjectId, ref: 'Company' },

        isEmailVerified: { type: Boolean, default: false },
        isPhoneVerified: { type: Boolean, default: false },
        identityVerificationStatus: {
            type: String,
            enum: Object.values(VERIFICATION_STATUS),
            default: 'unverified',
        },
        identityBadge: {
            type: String,
            enum: Object.values(IDENTITY_BADGE),
            default: IDENTITY_BADGE.NONE,
        },
        identityVerificationBadge: { type: Boolean, default: false },
        identityVerificationLevel: { type: Number, default: 0, select: false },
        isActive: { type: Boolean, default: true },
        isSuspended: { type: Boolean, default: false },
        suspendedReason: { type: String },
        lastSeen: { type: Date },

        subscriptionTier: {
            type: String,
            enum: Object.values(SUBSCRIPTION_TIER),
        },
        subscriptionExpiresAt: { type: Date },
        subscriptionWeight: { type: Number, default: 0 },
        referralCode: { type: String, unique: true },
        referredBy: { type: Schema.Types.ObjectId, ref: 'User' },

        emailOtp: { type: String, select: false },
        emailOtpExpires: { type: Date, select: false },
        phoneOtp: { type: String, select: false },
        phoneOtpExpires: { type: Date, select: false },

        emailOtpLastSentAt: { type: Date, select: false },
        emailOtpAttempts: { type: Number, default: 0, select: false },
        emailOtpBlockedUntil: { type: Date, select: false },
        passwordResetToken: { type: String, select: false },
        passwordResetExpires: { type: Date, select: false },
        slug: { type: String, unique: true, sparse: true, index: true },
        totalOrdersCompleted: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0, min: 0, max: 5 },
        totalReviews: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
)

userSchema.index({ role: 1, isActive: 1 })
userSchema.index({ identityVerificationStatus: 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ companyId: 1 })
userSchema.index({ referredBy: 1 })
userSchema.index({ emailOtpExpires: 1 })

userSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`
})

userSchema.pre('save', async function (next) {
    // 1. Hash password
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12)
    }

    // 2. Sync displayName
    if (this.isModified('firstName') || this.isModified('lastName')) {
        this.displayName = `${this.firstName} ${this.lastName}`
    }

    // 3. Generate referral code once
    if (!this.referralCode) {
        this.referralCode = await generateUniqueReferralCode()
    }

    // 4. Generate/update slug when name changes or slug is missing
    if (
        this.isModified('firstName') ||
        this.isModified('lastName') ||
        !this.slug
    ) {
        const base = slugify(`${this.firstName} ${this.lastName}`, {
            lower: true,
            strict: true,
        })

        const exists = await mongoose.model('User').findOne({
            slug: base,
            _id: { $ne: this._id },
        })

        this.slug = exists ? `${base}-${this._id.toString().slice(-5)}` : base
    }

    next()
})

userSchema.methods.comparePassword = function (
    candidatePassword: string,
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.getPublicProfile = function (): Partial<IUser> {
    const obj = this.toObject()
    // All fields that must NEVER leave the server — includes select:false fields
    // that may be present if the document was loaded with .select("+field")
    const excluded = [
        'password',
        'emailOtp',
        'emailOtpExpires',
        'emailOtpAttempts',
        'emailOtpBlockedUntil',
        'emailOtpLastSentAt',
        'phoneOtp',
        'phoneOtpExpires',
        'passwordResetToken',
        'passwordResetExpires',
        'avatarPublicId',
        '__v',
    ]
    excluded.forEach((key) => delete obj[key])
    return obj
}

userSchema.methods.isSubscriptionActive = function (): boolean {
    if (this.subscriptionTier === 'free') return true
    if (!this.subscriptionExpiresAt) return false
    return new Date() < this.subscriptionExpiresAt
}

userSchema.statics.findByEmail = function (
    this: Model<IUser>,
    email: string,
): Promise<UserDocument | null> {
    return this.findOne({ email: email.toLowerCase() }).select('+password')
}

const User = mongoose.model<IUser, IUserModel>('User', userSchema)
export default User
