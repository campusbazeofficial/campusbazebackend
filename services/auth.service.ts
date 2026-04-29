import crypto from 'crypto'
import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import User, { type UserDocument } from '../models/user.model.js'
import Company from '../models/company.model.js'
import Session from '../models/session.model.js'
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    generateOtp,
    TokenPayload,
} from '../utils/jwt.js'
import {
    sendOtpEmail,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    RESET_URL,
} from '../utils/emailSender.js'
import {
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from '../utils/appError.js'
import {
    CBC_WELCOME_CORPORATE,
    CBC_WELCOME_INDIVIDUAL,
    NOTIFICATION_TYPE,
    OTP_EXPIRES_MINUTES,
    SUBSCRIPTION_TIER,
} from '../utils/constant.js'
import type { UserRole } from '../types/index.js'
import planModel from '../models/plan.model.js'
import { emitToUser } from '../utils/socketHelper.js'

interface RegisterIndividualDto {
    firstName: string
    lastName: string
    email: string
    password: string
    phone?: string
    role?: UserRole
    isStudent?: boolean
    institutionName?: string
    referralCode?: string
}

interface RegisterCorporateDto {
    firstName: string
    lastName: string
    email: string
    password: string
    phone?: string
    companyName: string
    companyEmail: string
    companyPhone?: string
    rcNumber?: string
    industry?: string
    website?: string
    country?: string
    state?: string
    referralCode?: string
}

interface LoginDto {
    email: string
    password: string
    deviceInfo?: string
    ipAddress?: string
}

interface TokenPair {
    accessToken: string
    refreshToken: string
}

interface AuthResult {
    user: Record<string, unknown>
    tokens: TokenPair
}

export class AuthService extends BaseService {
    async registerIndividual(
        dto: RegisterIndividualDto,
    ): Promise<{ message: string }> {
        const existing = await User.findOne({ email: dto.email.toLowerCase() })
        if (existing) throw new ConflictError('Email is already registered')

        let referrer: UserDocument | null = null
        const referralCode = dto.referralCode?.trim().toUpperCase()

        if (referralCode) {
            referrer = await User.findOne({ referralCode })

            if (!referrer) {
                throw new ValidationError('Invalid referral code')
            }

            if (referrer.email === dto.email.toLowerCase()) {
                throw new ValidationError(
                    'You cannot use your own referral code',
                )
            }
        }

        const resolvedRole: UserRole =
            dto.role ??
            (dto.isStudent
                ? ('student' as UserRole)
                : ('professional' as UserRole))

        const user = await User.create({
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            password: dto.password,
            phone: dto.phone,
            role: resolvedRole,
            isStudent: dto.isStudent ?? false,
            institutionName: dto.institutionName,
            referredBy: referrer?._id,
            subscriptionTier: SUBSCRIPTION_TIER.FREE,
        })

        await this._issueEmailOtp(user)
        sendWelcomeEmail(user.email, user.firstName).catch(() => null)

        return {
            message:
                'Registration successful. Check your email for a verification code.',
        }
    }

    async registerCorporate(
        dto: RegisterCorporateDto,
    ): Promise<{ message: string }> {
        const [existingUser, existingCompany] = await Promise.all([
            User.findOne({ email: dto.email.toLowerCase() }),
            Company.findOne({ email: dto.companyEmail.toLowerCase() }),
        ])
        if (existingUser) throw new ConflictError('Email is already registered')
        if (existingCompany)
            throw new ConflictError('Company email is already registered')

        let referrer: UserDocument | null = null

        // registerCorporate
        if (dto.referralCode) {
            referrer = await User.findOne({
                referralCode: dto.referralCode.toUpperCase(),
            })
            if (!referrer) {
                throw new ValidationError('Invalid referral code')
            }
            // ✅ prevent self-referral via same email
            if (referrer && referrer.email === dto.email.toLowerCase()) {
                throw new ValidationError(
                    'You cannot use your own referral code',
                )
            }
        }

        const mongoSession = await mongoose.startSession()
        mongoSession.startTransaction()

        let createdUser: UserDocument | null = null

        try {
            const [user] = await User.create(
                [
                    {
                        firstName: dto.firstName,
                        lastName: dto.lastName,
                        email: dto.email,
                        password: dto.password,
                        phone: dto.phone,
                        role: 'corporate' as UserRole,
                        referredBy: referrer?._id,
                        subscriptionTier: SUBSCRIPTION_TIER.CORPORATE_FREE,
                    },
                ],
                { session: mongoSession },
            )

            const [company] = await Company.create(
                [
                    {
                        name: dto.companyName,
                        email: dto.companyEmail,
                        phone: dto.companyPhone,
                        rcNumber: dto.rcNumber,
                        industry: dto.industry,
                        website: dto.website,
                        country: dto.country || 'Nigeria',
                        state: dto.state,
                        ownerId: user._id,
                    },
                ],
                { session: mongoSession },
            )

            await User.findByIdAndUpdate(
                user._id,
                { companyId: company._id },
                { session: mongoSession },
            )

            await mongoSession.commitTransaction()
            createdUser = user
        } catch (err) {
            await mongoSession.abortTransaction()
            throw err
        } finally {
            mongoSession.endSession()
        }

        try {
            await this._issueEmailOtp(createdUser! as UserDocument)
        } catch {}

        sendWelcomeEmail(createdUser!.email, createdUser!.firstName).catch(
            () => null,
        )

        return {
            message:
                'Corporate registration successful. Check your email for a verification code.',
        }
    }

    async verifyEmailOtp(email: string, otp: string): Promise<AuthResult> {
        const user = await User.findOne({ email: email.toLowerCase() }).select(
            '+emailOtp +emailOtpExpires +emailOtpAttempts +emailOtpBlockedUntil',
        )

        if (!user) throw new NotFoundError('User')

        if (user.isEmailVerified) {
            throw new ValidationError('Email is already verified')
        }

        if (!user.emailOtp || !user.emailOtpExpires) {
            throw new ValidationError('No OTP was issued')
        }

        // 🚫 Block if locked
        if (
            user.emailOtpBlockedUntil &&
            dayjs().isBefore(user.emailOtpBlockedUntil)
        ) {
            throw new ValidationError('Too many attempts. Try again later.')
        }

        // ⏱ Expiry check FIRST
        if (dayjs().isAfter(dayjs(user.emailOtpExpires))) {
            throw new ValidationError('OTP has expired')
        }

        // 🔐 Hash input OTP
        const hashedInput = crypto
            .createHash('sha256')
            .update(otp)
            .digest('hex')

        // ❌ Invalid OTP → track attempts
        if (user.emailOtp !== hashedInput) {
            user.emailOtpAttempts = (user.emailOtpAttempts || 0) + 1

            if (user.emailOtpAttempts >= 5) {
                user.emailOtpBlockedUntil = dayjs().add(15, 'minute').toDate()
            }

            await user.save({ validateBeforeSave: false })

            throw new ValidationError('Invalid OTP')
        }

        // ✅ SUCCESS → reset security counters
        user.emailOtpAttempts = 0
        user.emailOtpBlockedUntil = null

        user.isEmailVerified = true
        user.emailOtp = undefined
        user.emailOtpExpires = undefined

        // ✅ Respect suspension
        if (!user.isSuspended) {
            user.isActive = true
        }

        await user.save()

        // After
        const defaultTier =
            user.role === 'corporate'
                ? SUBSCRIPTION_TIER.CORPORATE_FREE
                : SUBSCRIPTION_TIER.FREE

        const plan = await planModel
            .findOne({ tier: defaultTier, isActive: true })
            .select('welcomeBonusCbc')
            .lean()

        const bonusAmount = plan?.welcomeBonusCbc ?? 0

        // rest stays the same
        this._provisionCbcWallet(user._id.toString(), bonusAmount).catch(
            () => null,
        )
        this._sendWelcomeNotification(
            user._id.toString(),
            user.role === 'corporate' ? 'corporate' : 'individual',
            bonusAmount,
        ).catch(() => null)

        const tokens = await this._createSession(user)

        return { user: user.getPublicProfile(), tokens }
    }

    async resendEmailOtp(email: string): Promise<{ message: string }> {
        const user = await User.findOne({ email: email.toLowerCase() }).select(
            '+emailOtpExpires +emailOtpLastSentAt',
        )

        if (!user) throw new NotFoundError('User')

        if (user.isEmailVerified) {
            throw new ValidationError('Email is already verified')
        }

        // ⏱️ Enforce resend cooldown (e.g., 2 minutes)
        const COOLDOWN_MINUTES = 2

        if (
            user.emailOtpLastSentAt &&
            dayjs().diff(user.emailOtpLastSentAt, 'minute') < COOLDOWN_MINUTES
        ) {
            const waitTime =
                COOLDOWN_MINUTES -
                dayjs().diff(user.emailOtpLastSentAt, 'minute')

            throw new ValidationError(
                `Please wait ${waitTime} minute(s) before requesting a new OTP`,
            )
        }

        await this._issueEmailOtp(user)

        // update last sent timestamp
        user.emailOtpLastSentAt = new Date()
        await user.save()

        return { message: 'A new OTP has been sent to your email' }
    }

    async login(dto: LoginDto): Promise<AuthResult> {
        const user = await User.findByEmail(dto.email)

        if (!user) throw new UnauthorizedError('Invalid email or password')

        if (!user.isActive)
            throw new UnauthorizedError('Your account has been deactivated')
        if (user.isSuspended) {
            throw new AppError(
                `Account suspended: ${user.suspendedReason || 'contact support'}`,
                403,
            )
        }
        const isMatch = await user.comparePassword(dto.password)
        if (!isMatch) throw new UnauthorizedError('Invalid email or password')

        if (!user.isEmailVerified) {
            await this._issueEmailOtp(user)
            throw new AppError(
                'Email not verified. A new OTP has been sent.',
                403,
            )
        }

        user.lastSeen = new Date()
        await user.save({ validateBeforeSave: false })

        const tokens = await this._createSession(
            user,
            dto.deviceInfo,
            dto.ipAddress,
        )
        return { user: user.getPublicProfile(), tokens }
    }

    async refreshTokens(refreshToken: string): Promise<TokenPair> {
        const payload = verifyRefreshToken(refreshToken)
        const hashedRefreshToken = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex')
        const session = await Session.findOne({
            refreshToken: hashedRefreshToken,
            isRevoked: false,
        })
        if (!session)
            throw new UnauthorizedError('Session not found or revoked')
        if (dayjs().isAfter(dayjs(session.expiresAt))) {
            await Session.findByIdAndDelete(session._id)
            throw new UnauthorizedError('Session expired')
        }

        const user = await User.findById(payload.userId)
        if (!user || !user.isActive)
            throw new UnauthorizedError('User not found or inactive')

        // Rotate: issue new session first, then revoke old — prevents lockout on DB error
        const tokens = await this._createSession(user)
        session.isRevoked = true
        await session.save()

        return tokens
    }

    async logout(refreshToken: string): Promise<void> {
        const hashedRefreshToken = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex')
        await Session.findOneAndUpdate(
            { refreshToken: hashedRefreshToken },
            { isRevoked: true },
        )
    }

    async logoutAll(userId: string): Promise<void> {
        // FIX #6: cast string userId to ObjectId for correct Mongoose comparison
        await Session.updateMany(
            { userId: new mongoose.Types.ObjectId(userId), isRevoked: false },
            { isRevoked: true },
        )
    }

    async forgotPassword(email: string): Promise<{ message: string }> {
        const user = await User.findOne({ email: email.toLowerCase() }).select(
            '+passwordResetToken +passwordResetExpires',
        )

        // Always return success to prevent email enumeration
        if (!user)
            return {
                message: 'If that email exists, a reset link has been sent',
            }

        const token = crypto.randomBytes(32).toString('hex')
        user.passwordResetToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex')
        user.passwordResetExpires = dayjs().add(1, 'hour').toDate()
        await user.save({ validateBeforeSave: false })

        const resetUrl = `${RESET_URL}?token=${token}`

        // FIX #2 + #8: use static sendPasswordResetEmail — no dynamic import needed,
        // and uses the shared email template for consistency
        await sendPasswordResetEmail(user.email, user.firstName, resetUrl)

        return { message: 'If that email exists, a reset link has been sent' }
    }

    async resetPassword(
        token: string,
        newPassword: string,
    ): Promise<{ message: string }> {
        const hashed = crypto.createHash('sha256').update(token).digest('hex')
        const user = await User.findOne({
            passwordResetToken: hashed,
            passwordResetExpires: { $gt: new Date() },
        }).select('+password +passwordResetToken +passwordResetExpires')

        if (!user)
            throw new ValidationError('Reset token is invalid or has expired')

        user.password = newPassword
        user.passwordResetToken = undefined
        user.passwordResetExpires = undefined
        await user.save()

        await Session.updateMany({ userId: user._id }, { isRevoked: true })

        return { message: 'Password reset successful. Please log in.' }
    }

    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<{ message: string }> {
        const user = await User.findById(userId).select('+password')
        if (!user) throw new NotFoundError('User')

        const isMatch = await user.comparePassword(currentPassword)
        if (!isMatch) throw new ValidationError('Current password is incorrect')

        user.password = newPassword
        await user.save()

        // FIX #6: cast userId string to ObjectId
        await Session.updateMany(
            { userId: new mongoose.Types.ObjectId(userId), isRevoked: false },
            { isRevoked: true },
        )

        return { message: 'Password changed successfully' }
    }

    async adminLogin(dto: LoginDto): Promise<AuthResult> {
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
        const adminPassword = process.env.ADMIN_PASSWORD
        const adminFullName = process.env.ADMIN_FULL_NAME ?? 'Admin'

        if (!adminEmail || !adminPassword) {
            throw new AppError('Admin credentials not configured', 500)
        }

        if (dto.email.toLowerCase() !== adminEmail) {
            throw new UnauthorizedError('Invalid email or password')
        }

        if (dto.password !== adminPassword) {
            throw new UnauthorizedError('Invalid email or password')
        }

        // Find or lazily create the admin user record (for session tracking only)
        let admin = await User.findOne({ email: adminEmail })

        if (!admin) {
            const [firstName, ...rest] = adminFullName.split(' ')
            admin = await User.create({
                firstName,
                lastName: rest.join(' ') || 'Admin',
                email: adminEmail,
                password: adminPassword,
                role: 'admin' as UserRole,
                isEmailVerified: true,
                isActive: true,
            })
        }

        if (!admin.isActive)
            throw new UnauthorizedError('Admin account is deactivated')
        if (admin.isSuspended)
            throw new ForbiddenError('Admin account is suspended')

        admin.lastSeen = new Date()
        await admin.save({ validateBeforeSave: false })

        const tokens = await this._createSession(
            admin,
            dto.deviceInfo,
            dto.ipAddress,
        )

        return { user: admin.getPublicProfile(), tokens }
    }

    private async _issueEmailOtp(user: UserDocument): Promise<void> {
        const otp = generateOtp(6)
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex')

        user.emailOtp = hashedOtp
        user.emailOtpExpires = dayjs()
            .add(OTP_EXPIRES_MINUTES, 'minute')
            .toDate()
        await user.save({ validateBeforeSave: false })
        await sendOtpEmail(user.email, otp, user.firstName)
    }
    async revokeSession(userId: string, sessionId: string): Promise<void> {
        const session = await Session.findOne({
            _id: new mongoose.Types.ObjectId(sessionId),
            userId: new mongoose.Types.ObjectId(userId), // ← ensures users can only revoke their own sessions
        })
        if (!session) throw new NotFoundError('Session')
        if (session.isRevoked)
            throw new ConflictError('Session is already revoked')

        session.isRevoked = true
        await session.save()
        emitToUser(userId, 'session:revoked', {
            sessionId,
            reason: 'This session was revoked from another device',
        })
    }
    // private async _createSession(
    //     user: UserDocument,
    //     deviceInfo?: string,
    //     ipAddress?: string,
    // ): Promise<TokenPair> {
    //     const payload = {
    //         userId: user._id.toString(),
    //         role: user.role as string,
    //     }

    //     const accessToken = signAccessToken(payload)
    //     const refreshToken = signRefreshToken(payload)
    //     const hashedRefreshToken = crypto
    //         .createHash('sha256')
    //         .update(refreshToken)
    //         .digest('hex')

    //     await Session.create({
    //         userId: user._id,
    //         refreshToken: hashedRefreshToken,
    //         deviceInfo,
    //         ipAddress,
    //         expiresAt: dayjs().add(30, 'day').toDate(),
    //     })

    //     return { accessToken, refreshToken }
    // }
    private async _createSession(
        user: UserDocument,
        deviceInfo?: string,
        ipAddress?: string,
    ): Promise<TokenPair> {
        const sessionId = new mongoose.Types.ObjectId() // ✅ generate ID upfront

        const payload: TokenPayload = {
            userId: user._id.toString(),
            role: user.role as string,
            sessionId: sessionId.toString(),
        }

        const accessToken = signAccessToken(payload)
        const refreshToken = signRefreshToken(payload)
        const hashedRefreshToken = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex')

        await Session.create({
            _id: sessionId, // ✅ use pre-generated ID
            userId: user._id,
            refreshToken: hashedRefreshToken,
            deviceInfo,
            ipAddress,
            expiresAt: dayjs().add(30, 'day').toDate(),
        })

        return { accessToken, refreshToken }
    }

    private async _provisionCbcWallet(
        userId: string,
        welcomeBonus: number,
    ): Promise<void> {
        const { CbcService } = await import('./cbc.service.js')
        const cbcService = new CbcService()
        await cbcService.provisionWallet(userId, welcomeBonus)
    }

    private async _sendWelcomeNotification(
        userId: string,
        accountType: 'individual' | 'corporate',
        bonusAmount: number,
    ): Promise<void> {
        const { NotificationService } =
            await import('./notification.service.js')
        const notificationService = new NotificationService()
        await notificationService.create({
            userId,
            type: NOTIFICATION_TYPE.CBC_CREDIT,
            title: 'Welcome to CampusBaze!',
            body: `Your account is verified. ${bonusAmount} CBC coins have been added to your wallet as a welcome bonus.`,
            data: { bonusAmount, accountType },
        })
    }
}
