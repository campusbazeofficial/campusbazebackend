import crypto from 'crypto'
import dayjs from 'dayjs'
import mongoose, { type FilterQuery } from 'mongoose'
import { BaseService } from './base.service.js'
import Verification, {
    VERIFICATION_DOC_TYPE,
    type VerificationDocType,
    type IVerification,
} from '../models/verification.model.js'
import User from '../models/user.model.js'
import Company from '../models/company.model.js'
import {
    getPrivateDownloadUrl,
    getSignedUrl,
    uploadToCloudinary,
    uploadVerificationDoc,
} from '../middlewares/upload.js'
import {
    NotFoundError,
    ConflictError,
    ForbiddenError,
    ValidationError,
} from '../utils/appError.js'
import {
    VERIFICATION_STATUS,
    USER_ROLE,
    OTP_EXPIRES_MINUTES,
    NOTIFICATION_TYPE,
    DOC_LEVEL_MAP,
    IDENTITY_BADGE,
    ALLOWED_DOC_TYPES,
} from '../utils/constant.js'
import {
    RETRY_URL,
    sendVerificationApprovedEmail,
    sendVerificationRejectedEmail,
} from '../utils/emailSender.js'
import { sendPhoneOtp } from '../utils/sendOtp.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import { NotificationService } from './notification.service.js'
import { isValidNigerianPhone, normalisePhone } from '../utils/helper.js'
import { emitToUser } from '../utils/socketHelper.js'

const notificationService = new NotificationService()

const DOC_TYPE_LABELS: Record<string, string> = {
    student_id: 'Student ID',
    national_id: 'National ID',
    nin: 'National Identification Number (NIN)',
    passport: 'International Passport',
    voters_card: "Voter's Card",
    cac: 'CAC Certificate of Incorporation',
    director_id: 'Company Director ID',
}

function docLabel(docType: string): string {
    return DOC_TYPE_LABELS[docType] ?? docType
}

function classifyDoc(docType: VerificationDocType): {
    isStudentDoc: boolean
    isCompanyDoc: boolean
} {
    return {
        isStudentDoc: docType === VERIFICATION_DOC_TYPE.STUDENT_ID,
        isCompanyDoc:
            docType === VERIFICATION_DOC_TYPE.CAC ||
            docType === VERIFICATION_DOC_TYPE.DIRECTOR_ID,
    }
}

export class VerificationService extends BaseService {
    // async submitDocument(
    //     userId: string,
    //     docType: VerificationDocType,
    //     fileBuffer: Buffer,
    //     fileMimetype: string,
    // ) {
    //     const existing = await Verification.findOne({
    //         userId: new mongoose.Types.ObjectId(userId),
    //         docType,
    //         status: {
    //             $in: [
    //                 VERIFICATION_STATUS.PENDING,
    //                 VERIFICATION_STATUS.VERIFIED,
    //             ],
    //         },
    //     }).lean()

    //     if (existing?.status === VERIFICATION_STATUS.VERIFIED) {
    //         throw new ConflictError(`${docLabel(docType)} is already verified`)
    //     }
    //     if (existing?.status === VERIFICATION_STATUS.PENDING) {
    //         throw new ConflictError(
    //             `${docLabel(docType)} verification is already pending review`,
    //         )
    //     }

    //     const resourceType =
    //         fileMimetype === 'application/pdf' ? 'raw' : 'image'
    //     const result = await uploadToCloudinary(
    //         fileBuffer,
    //         `campusbaze/verifications/${userId}`,
    //         resourceType,
    //     )

    //     let companyId: mongoose.Types.ObjectId | undefined
    //     const { isCompanyDoc } = classifyDoc(docType)
    //     if (isCompanyDoc) {
    //         const user = await User.findById(userId).select('companyId').lean()
    //         companyId = user?.companyId
    //     }

    //     const doc = await Verification.create({
    //         userId: new mongoose.Types.ObjectId(userId),
    //         companyId,
    //         docType,
    //         documentUrl: result.secure_url,
    //         documentPublicId: result.public_id,
    //         status: VERIFICATION_STATUS.PENDING,
    //         submittedAt: new Date(),
    //     })

    //     await User.findByIdAndUpdate(userId, {
    //         identityVerificationStatus: VERIFICATION_STATUS.PENDING,
    //     })

    //     return {
    //         id: doc._id,
    //         docType: doc.docType,
    //         docTypeLabel: docLabel(doc.docType),
    //         status: doc.status,
    //         submittedAt: doc.submittedAt,
    //     }
    // }
    async submitDocument(
        userId: string,
        docType: VerificationDocType,
        fileBuffer: Buffer,
        fileMimetype: string,
    ) {
        // ── Fetch user role + student status before anything else ─────────────
        const user = await User.findById(userId)
            .select('role isStudent companyId')
            .lean()
        if (!user) throw new NotFoundError('User')

        // ── Validate doc type is allowed for this user ────────────────────────
        const allowedDocs =
            user.role === USER_ROLE.CORPORATE
                ? ALLOWED_DOC_TYPES.corporate
                : user.isStudent
                  ? ALLOWED_DOC_TYPES.student
                  : ALLOWED_DOC_TYPES.individual

        if (!allowedDocs.includes(docType)) {
            const allowedLabels = allowedDocs.map(docLabel).join(', ')
            throw new ForbiddenError(
                `You cannot submit a ${docLabel(docType)}. ` +
                    `Accepted documents for your account type: ${allowedLabels}.`,
            )
        }

        // ── Duplicate check ───────────────────────────────────────────────────
        const existing = await Verification.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            docType,
            status: {
                $in: [
                    VERIFICATION_STATUS.PENDING,
                    VERIFICATION_STATUS.VERIFIED,
                ],
            },
        }).lean()

        if (existing?.status === VERIFICATION_STATUS.VERIFIED) {
            throw new ConflictError(`${docLabel(docType)} is already verified`)
        }
        if (existing?.status === VERIFICATION_STATUS.PENDING) {
            throw new ConflictError(
                `${docLabel(docType)} verification is already pending review`,
            )
        }

        // ── Upload ────────────────────────────────────────────────────────────
        // const resourceType =
        //     fileMimetype === 'application/pdf' ? 'raw' : 'image'
        const result = await uploadVerificationDoc(
            fileBuffer,
            `campusbaze/verifications/${userId}`,
            fileMimetype, // ← pass mimetype, let the fn derive resourceType
        )

        // ── Attach companyId for corporate docs ───────────────────────────────
        const { isCompanyDoc } = classifyDoc(docType)
        const companyId = isCompanyDoc ? user.companyId : undefined

        const doc = await Verification.create({
            userId: new mongoose.Types.ObjectId(userId),
            companyId,
            docType,
            documentUrl: result.secure_url,
            documentPublicId: result.public_id,
            // ← store so signing works later
            documentResourceType:
                fileMimetype === 'application/pdf' ? 'raw' : 'image',
            status: VERIFICATION_STATUS.PENDING,
            submittedAt: new Date(),
        })

        await User.findByIdAndUpdate(userId, {
            identityVerificationStatus: VERIFICATION_STATUS.PENDING,
        })

        return {
            id: doc._id,
            docType: doc.docType,
            docTypeLabel: docLabel(doc.docType),
            status: doc.status,
            submittedAt: doc.submittedAt,
        }
    }
    async getMyVerifications(userId: string) {
        return Verification.find({
            userId: new mongoose.Types.ObjectId(userId),
        })
            .sort({ createdAt: -1 })
            .select('-documentPublicId')
            .lean()
    }
    async getVerificationStatus(userId: string) {
        const [user, docs] = await Promise.all([
            User.findById(userId)
                .select(
                    'isEmailVerified isPhoneVerified isStudent ' +
                        'identityVerificationStatus identityVerificationBadge ' +
                        '+identityVerificationLevel subscriptionTier subscriptionExpiresAt',
                )
                .lean(),
            Verification.find({ userId: new mongoose.Types.ObjectId(userId) })
                .select('docType status submittedAt reviewedAt adminNote')
                .lean(),
        ])

        if (!user) throw new NotFoundError('User')

        const level = user.identityVerificationLevel ?? 0
        const isTier0 = user.isEmailVerified && user.isPhoneVerified

        const verificationTierLabel =
            level >= 2
                ? 'Tier 2 — Gold Verified'
                : level === 1 && user.isStudentVerified
                  ? 'Tier 1A — Student Verified'
                  : level === 1
                    ? 'Tier 1B — ID Verified'
                    : isTier0
                      ? 'Tier 0 — Basic Verified'
                      : 'Unverified'

        const nextTierRequirement =
            level >= 2
                ? null
                : level === 1
                  ? 'Verify your phone number to reach Tier 2 (Gold badge + Elite eligibility)'
                  : isTier0
                    ? 'Submit a Student ID (Tier 1A) or government-issued ID (Tier 1B) to get verified'
                    : 'Verify your phone number to reach Tier 0'

        return {
            emailVerified: user.isEmailVerified,
            phoneVerified: user.isPhoneVerified,
            identityStatus: user.identityVerificationStatus,
            badgeEarned: user.identityVerificationBadge,
            isStudent: user.isStudent,
            isStudentVerified: user.isStudentVerified,
            studentPricingEligible: user.isStudentVerified,
            // ── Verification tier ─────────────────────────────────────────────
            verificationLevel: level,
            verificationTierLabel,
            nextTierRequirement,

            // ── Subscription tier ─────────────────────────────────────────────
            subscriptionTier: user.subscriptionTier,
            subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
            isSubscriptionActive:
                user.subscriptionTier === 'free' ||
                (!!user.subscriptionExpiresAt &&
                    new Date() < user.subscriptionExpiresAt),

            documents: docs.map((d) => ({
                docType: d.docType,
                docTypeLabel: docLabel(d.docType),
                status: d.status,
                submittedAt: d.submittedAt,
                reviewedAt: d.reviewedAt ?? null,
                adminNote: d.adminNote ?? null,
            })),
        }
    }
    async sendPhoneVerificationOtp(userId: string, rawPhone: string) {
        const user = await User.findById(userId).select(
            '+phoneOtp +phoneOtpExpires',
        )
        if (!user) throw new NotFoundError('User')

        if (user.isPhoneVerified) {
            throw new ConflictError('Phone number is already verified')
        }

        const phone = normalisePhone(rawPhone)
        if (!isValidNigerianPhone(phone)) {
            throw new ValidationError(
                'Invalid phone number. Please provide a valid Nigerian number (e.g. 08012345678 or +2348012345678).',
            )
        }

        if (
            user.phoneOtpExpires &&
            dayjs().isBefore(
                dayjs(user.phoneOtpExpires).subtract(
                    OTP_EXPIRES_MINUTES - 2,
                    'minute',
                ),
            )
        ) {
            throw new ValidationError(
                'Please wait before requesting another OTP. Check your SMS messages.',
            )
        }

        const rawOtp = crypto.randomInt(100000, 1000000).toString()
        const hashedOtp = crypto
            .createHash('sha256')
            .update(rawOtp)
            .digest('hex')

        const { sent } = await sendPhoneOtp(phone, rawOtp)

        if (!sent) {
            throw new ValidationError(
                'Failed to send OTP. Please check your phone number and try again.',
            )
        }
        user.phoneOtp = hashedOtp
        user.phoneOtpExpires = dayjs()
            .add(OTP_EXPIRES_MINUTES, 'minute')
            .toDate()
        user.phone = phone // store normalised international format
        await user.save({ validateBeforeSave: false })

        return {
            message: 'OTP sent to your phone number',
            phone: `${rawPhone.slice(0, 4)}****${rawPhone.slice(-2)}`,
        }
    }
    async verifyPhoneOtp(userId: string, otp: string) {
        const user = await User.findById(userId).select(
            '+phoneOtp +phoneOtpExpires +identityVerificationLevel',
        )
        if (!user) throw new NotFoundError('User')

        if (user.isPhoneVerified)
            throw new ConflictError('Phone number is already verified')
        if (!user.phoneOtp || !user.phoneOtpExpires)
            throw new ValidationError('No OTP was issued. Request a new one.')
        if (dayjs().isAfter(dayjs(user.phoneOtpExpires)))
            throw new ValidationError('OTP has expired. Request a new one.')

        const hashedInput = crypto
            .createHash('sha256')
            .update(otp.toUpperCase())
            .digest('hex')
        if (user.phoneOtp !== hashedInput)
            throw new ValidationError('Invalid OTP')

        // ── Check if doc was already approved before phone ────────────────────
        const verifiedDoc = await Verification.findOne({
            userId: user._id,
            status: VERIFICATION_STATUS.VERIFIED,
            docType: {
                $in: [
                    'national_id',
                    'nin',
                    'passport',
                    'voters_card',
                    'student_id',
                ],
            },
        })
            .select('docType')
            .lean()

        const newLevel = verifiedDoc ? 2 : 0

        await User.findByIdAndUpdate(user._id, {
            isPhoneVerified: true,
            phoneOtp: undefined,
            phoneOtpExpires: undefined,
            identityVerificationLevel: Math.max(
                user.identityVerificationLevel ?? 0,
                newLevel,
            ),
            // upgrade badge to gold only if they already had a doc verified
            ...(verifiedDoc && {
                identityVerificationBadge: true,
                identityBadge: IDENTITY_BADGE.GOLD_VERIFIED,
            }),
        })
        emitToUser(userId, 'profile:updated', {
            isPhoneVerified: true,
            identityVerificationLevel: newLevel,
            ...(verifiedDoc && {
                identityVerificationBadge: true,
                identityBadge: IDENTITY_BADGE.GOLD_VERIFIED,
            }),
        })

        notificationService
            .create({
                userId,
                type: NOTIFICATION_TYPE.VERIFICATION,
                title: 'Phone number verified',
                body:
                    newLevel === 2
                        ? 'Phone verified! Combined with your identity document, you are now Tier 2 — Gold Verified.'
                        : 'Your phone number has been verified.',
                data: { phone: user.phone },
            })
            .catch(() => null)

        return {
            message: 'Phone number verified successfully',
            phone: user.phone,
            tier: newLevel === 2 ? 'Tier 2 — Gold Verified' : 'Tier 0 — Basic',
            verificationLevel: newLevel,
        }
    }
    async listForAdmin(
        opts: PaginationOptions & { status?: string; flagged?: boolean },
    ) {
        const filter: Record<string, unknown> = {}
        if (opts.status && opts.status !== 'all') filter.status = opts.status
        if (opts.flagged === true) filter.aiFlaggedForReview = true

        const results = await paginate(
            Verification,
            filter as FilterQuery<IVerification>,
            {
                page: opts.page,
                limit: opts.limit,
                sort: 'createdAt',
                order: 'asc',
            },
            'docType status submittedAt reviewedAt adminNote aiFlaggedForReview documentPublicId documentResourceType userId companyId createdAt',
            [
                {
                    path: 'userId',
                    select: 'firstName lastName email role isStudent isStudentVerified +identityVerificationLevel',
                },
                { path: 'companyId', select: 'name verificationStatus' },
            ],
        )

        const data = results.data.map((doc) => {
            const plain =
                typeof (doc as any).toObject === 'function'
                    ? (doc as any).toObject()
                    : { ...doc }

            const publicId = plain.documentPublicId
            const resourceType = plain.documentResourceType ?? 'image'

            return {
                ...plain,
                documentUrl: publicId
                    ? resourceType === 'raw'
                        ? getPrivateDownloadUrl(publicId, 'raw')
                        : getSignedUrl(publicId, 'image')
                    : (plain.documentUrl ?? null),
                documentPublicId: undefined,
                documentResourceType: undefined,
            }
        })

        return {
            ...results,
            data,
        }
    }
    async reviewDocument(
        verificationId: string,
        adminUserId: string,
        status: string,
        adminNote?: string,
    ) {
        const doc = await Verification.findById(verificationId)
        if (!doc) throw new NotFoundError('Verification submission')
        if (doc.status !== VERIFICATION_STATUS.PENDING) {
            throw new ConflictError('This submission has already been reviewed')
        }
        if (status === VERIFICATION_STATUS.REJECTED && !adminNote?.trim()) {
            throw new ValidationError(
                'A rejection reason is required so the user knows how to resubmit',
            )
        }

        doc.status = status
        doc.adminNote = adminNote?.trim()
        doc.reviewedBy = new mongoose.Types.ObjectId(adminUserId)
        doc.reviewedAt = new Date()
        await doc.save()

        emitToUser(doc.userId.toString(), 'verification:updated', {
            id: doc._id.toString(),
            docType: doc.docType,
            status: doc.status,
            adminNote: doc.adminNote ?? null,
            reviewedAt: doc.reviewedAt,
        })
        if (status === VERIFICATION_STATUS.VERIFIED) {
            await this._handleApproval(
                doc.userId.toString(),
                doc.docType,
                doc._id.toString(),
            )
        } else {
            const user = await User.findById(doc.userId)
                .select('email firstName')
                .lean()
            if (user) {
                sendVerificationRejectedEmail(
                    user.email,
                    user.firstName,
                    docLabel(doc.docType),
                    doc.adminNote ??
                        'Your document did not meet our verification requirements.',
                ).catch(() => null)
                // In-app
                notificationService
                    .create({
                        userId: doc.userId.toString(),
                        type: NOTIFICATION_TYPE.VERIFICATION,
                        title: 'Verification update',
                        body: `Your ${docLabel(doc.docType)} submission could not be approved. Tap to see the reason and resubmit.`,
                        data: {
                            docType: doc.docType,
                            adminNote: doc.adminNote,
                            retryUrl: RETRY_URL,
                        },
                    })
                    .catch(() => null)
            }
        }

        return {
            id: doc._id,
            status: doc.status,
            reviewedAt: doc.reviewedAt,
            adminNote: doc.adminNote ?? null,
            documentUrl: doc.documentPublicId
                ? doc.documentResourceType === 'raw'
                    ? getPrivateDownloadUrl(doc.documentPublicId, 'raw')
                    : getSignedUrl(doc.documentPublicId, 'image')
                : null,
        }
    }
    async getAllowedDocTypes(userId: string) {
        const user = await User.findById(userId).select('role isStudent').lean()
        if (!user) throw new NotFoundError('User')

        const allowedDocs =
            user.role === USER_ROLE.CORPORATE
                ? ALLOWED_DOC_TYPES.corporate
                : user.isStudent
                  ? ALLOWED_DOC_TYPES.student
                  : ALLOWED_DOC_TYPES.individual

        return {
            accountType:
                user.role === USER_ROLE.CORPORATE
                    ? 'corporate'
                    : user.isStudent
                      ? 'student'
                      : 'individual',
            allowedDocTypes: allowedDocs.map((d) => ({
                docType: d,
                label: docLabel(d),
            })),
        }
    }
    private async _handleApproval(
        userId: string,
        docType: VerificationDocType,
        verificationId: string,
    ): Promise<void> {
        const { isStudentDoc, isCompanyDoc } = classifyDoc(docType)

        const user = await User.findById(userId)
            .select(
                '+identityVerificationLevel identityBadge isPhoneVerified email firstName companyId',
            )
            .lean()
        if (!user) return

        const docLevel = DOC_LEVEL_MAP[docType] ?? 0
        const currentLevel = user.identityVerificationLevel ?? 0

        // ── Tier 2 = phone verified AND identity doc approved ─────────────────
        const hasPhone = user.isPhoneVerified
        const hasDoc = docLevel >= 1
        const newLevel =
            hasPhone && hasDoc
                ? 2
                : hasDoc
                  ? Math.max(currentLevel, 1)
                  : currentLevel

        // ── Resolve badge ─────────────────────────────────────────────────────
        let newBadge: string = user.identityBadge ?? IDENTITY_BADGE.NONE

        if (isStudentDoc) {
            // Tier 1A → student_verified, upgrade to gold if phone also verified
            newBadge = hasPhone
                ? IDENTITY_BADGE.GOLD_VERIFIED
                : IDENTITY_BADGE.STUDENT_VERIFIED
        } else if (isCompanyDoc) {
            // Corporate: badge only once BOTH cac AND director_id are verified
            const [hasDirector, hasCac] = await Promise.all([
                Verification.exists({
                    userId: new mongoose.Types.ObjectId(userId),
                    status: VERIFICATION_STATUS.VERIFIED,
                    docType: VERIFICATION_DOC_TYPE.DIRECTOR_ID,
                }),
                Verification.exists({
                    userId: new mongoose.Types.ObjectId(userId),
                    status: VERIFICATION_STATUS.VERIFIED,
                    docType: VERIFICATION_DOC_TYPE.CAC,
                }),
            ])
            if (hasDirector && hasCac) {
                newBadge = IDENTITY_BADGE.CORPORATE
            }
        } else {
            // national_id, nin, passport, voters_card → Tier 1B
            // upgrade to gold if phone also verified
            newBadge = hasPhone
                ? IDENTITY_BADGE.GOLD_VERIFIED
                : IDENTITY_BADGE.ID_VERIFIED
        }

        const userUpdate: Record<string, unknown> = {
            identityVerificationStatus: VERIFICATION_STATUS.VERIFIED,
            identityVerificationBadge: newLevel >= 1,
            identityVerificationLevel: newLevel,
            identityBadge: newBadge,
        }
        if (isStudentDoc) userUpdate.isStudentVerified = true

        await User.findByIdAndUpdate(userId, userUpdate)

        emitToUser(userId, 'profile:updated', {
            identityVerificationStatus: VERIFICATION_STATUS.VERIFIED,
            identityVerificationBadge: newLevel >= 1,
            identityVerificationLevel: newLevel,
            identityBadge: newBadge,
            ...(isStudentDoc && { isStudentVerified: true }),
        })
        // revert status to pending if other docs still pending
        const otherPending = await Verification.exists({
            userId: new mongoose.Types.ObjectId(userId),
            _id: { $ne: new mongoose.Types.ObjectId(verificationId) },
            status: VERIFICATION_STATUS.PENDING,
        })
        if (otherPending) {
            await User.findByIdAndUpdate(userId, {
                identityVerificationStatus: VERIFICATION_STATUS.PENDING,
            })
        }

        if (isCompanyDoc && user.companyId) {
            await Company.findByIdAndUpdate(user.companyId, {
                verificationStatus: VERIFICATION_STATUS.VERIFIED,
                verificationBadge: true,
            })
        }

        sendVerificationApprovedEmail(
            user.email,
            user.firstName,
            docLabel(docType),
        ).catch(() => null)

        notificationService
            .create({
                userId,
                type: NOTIFICATION_TYPE.VERIFICATION,
                title: 'Verification approved ',
                body: `Your ${docLabel(docType)} has been verified.`,
                data: { docType, badge: newBadge, level: newLevel },
            })
            .catch(() => null)
    }
}
