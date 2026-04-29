import { get } from 'axios'
import {
    AUTH_ROUTES,
    USER_ROUTES,
    WALLET_ROUTES,
    VERIFICATION_ROUTES,
    ADMIN_ROUTES,
    WEBHOOK_ROUTES,
    ERRAND_ROUTES,
    SERVICE_ROUTES,
    NOTIFICATION_ROUTES,
    CHAT_ROUTES,
    SUBSCRIPTION_ROUTES,
    SKILL_ROUTES,
} from '../constants/page-route.js'

// ─── Reusable fragments ───────────────────────────────────────────────────────

const bearerAuth = [{ BearerAuth: [] }]

const r200 = (description: string, schemaRef?: string) => ({
    200: {
        description,
        content: schemaRef
            ? {
                  'application/json': {
                      schema: { $ref: `#/components/schemas/${schemaRef}` },
                  },
              }
            : undefined,
    },
})
const r201 = (description: string) => ({ 201: { description } })
const r400 = { description: 'Validation error' }
const r401 = { description: 'Unauthorized' }
const r403 = { description: 'Forbidden' }
const r404 = { description: 'Not found' }
const r409 = { description: 'Conflict' }
const r422 = { description: 'Unprocessable entity' }

const jsonBody = (schemaRef: string) => ({
    required: true,
    content: {
        'application/json': {
            schema: { $ref: `#/components/schemas/${schemaRef}` },
        },
    },
})

const pagingParams = [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
    { name: 'sort', in: 'query', schema: { type: 'string' } },
    {
        name: 'order',
        in: 'query',
        schema: { type: 'string', enum: ['asc', 'desc'] },
    },
]

const pathParam = (name: string) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authPaths = {
    [AUTH_ROUTES.REGISTER]: {
        post: {
            tags: ['Auth'],
            summary: 'Register individual user',
            security: [],
            requestBody: jsonBody('RegisterIndividualRequest'),
            responses: {
                ...r201('Registration successful — OTP sent to email'),
                400: r400,
                409: r409,
            },
        },
    },
    [AUTH_ROUTES.REGISTER_CORPORATE]: {
        post: {
            tags: ['Auth'],
            summary: 'Register corporate account',
            security: [],
            requestBody: jsonBody('RegisterCorporateRequest'),
            responses: {
                ...r201('Corporate registration successful'),
                400: r400,
                409: r409,
            },
        },
    },
    [AUTH_ROUTES.VERIFY_EMAIL]: {
        post: {
            tags: ['Auth'],
            summary: 'Verify email with OTP',
            security: [],
            requestBody: jsonBody('VerifyEmailRequest'),
            responses: {
                ...r200(
                    'Email verified — returns tokens + user profile',
                    'AuthResult',
                ),
                400: r400,
                404: r404,
            },
        },
    },
    [AUTH_ROUTES.RESEND_OTP]: {
        post: {
            tags: ['Auth'],
            summary: 'Resend email OTP',
            security: [],
            requestBody: jsonBody('EmailOnlyRequest'),
            responses: {
                ...r200('OTP resent'),
                400: r400,
                429: { description: 'Rate limited' },
            },
        },
    },
    [AUTH_ROUTES.LOGIN]: {
        post: {
            tags: ['Auth'],
            summary: 'Login',
            security: [],
            requestBody: jsonBody('LoginRequest'),
            responses: {
                ...r200(
                    'Login successful — returns tokens + user profile',
                    'AuthResult',
                ),
                401: r401,
                403: r403,
            },
        },
    },
    [AUTH_ROUTES.REFRESH]: {
        post: {
            tags: ['Auth'],
            summary: 'Rotate access and refresh tokens',
            security: [],
            requestBody: jsonBody('RefreshRequest'),
            responses: {
                ...r200('New token pair issued', 'TokenPair'),
                401: r401,
            },
        },
    },
    [AUTH_ROUTES.LOGOUT]: {
        post: {
            tags: ['Auth'],
            summary: 'Logout (revoke current session)',
            security: [],
            requestBody: jsonBody('RefreshRequest'),
            responses: { ...r200('Logged out'), 400: r400 },
        },
    },
    [AUTH_ROUTES.LOGOUT_ALL]: {
        post: {
            tags: ['Auth'],
            summary: 'Logout all sessions',
            security: bearerAuth,
            responses: { ...r200('All sessions revoked'), 401: r401 },
        },
    },
    [AUTH_ROUTES.FORGOT_PASSWORD]: {
        post: {
            tags: ['Auth'],
            summary: 'Request password reset email',
            security: [],
            requestBody: jsonBody('ForgotPasswordRequest'),
            responses: { ...r200('Reset link sent (always)') },
        },
    },
    [AUTH_ROUTES.RESET_PASSWORD]: {
        post: {
            tags: ['Auth'],
            summary: 'Reset password using token',
            security: [],
            requestBody: jsonBody('ResetPasswordRequest'),
            responses: { ...r200('Password reset'), 422: r422 },
        },
    },
    [AUTH_ROUTES.CHANGE_PASSWORD]: {
        patch: {
            tags: ['Auth'],
            summary: 'Change password (authenticated)',
            security: bearerAuth,
            requestBody: jsonBody('ChangePasswordRequest'),
            responses: { ...r200('Password changed'), 401: r401, 422: r422 },
        },
    },
    [AUTH_ROUTES.REVOKE_SESSION]: {
        delete: {
            tags: ['Auth'],
            summary: 'Revoke a specific session (log out another device)',
            description:
                'Revokes a session by ID. The session must belong to the authenticated user. ' +
                'Use GET /me/sessions to list active session IDs with their device info.',
            security: bearerAuth,
            parameters: [
                {
                    name: 'sessionId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                    description: 'The session ID to revoke',
                },
            ],
            responses: {
                ...r200('Session revoked'),
                401: r401,
                404: r404,
                409: r409, // already revoked
            },
        },
    },
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const userPaths = {
    [USER_ROUTES.ME]: {
        get: {
            tags: ['Users'],
            summary: 'Get own profile (all roles)',
            description:
                "Returns the authenticated user's own profile. For corporate accounts, also returns the linked Company document.",
            security: bearerAuth,
            responses: {
                ...r200('Profile + company (if corporate)'),
                401: r401,
            },
        },
        patch: {
            tags: ['Users'],
            summary:
                'Update profile — individual only (student / alumni / professional)',
            description:
                'Returns 403 for corporate accounts. Use PATCH /me/corporate instead.',
            security: bearerAuth,
            requestBody: jsonBody('UpdateIndividualProfileRequest'),
            responses: { ...r200('Updated profile'), 401: r401, 403: r403 },
        },
    },

    [USER_ROUTES.ME_CORPORATE]: {
        patch: {
            tags: ['Users'],
            summary: 'Update profile — corporate only',
            description:
                'Updates director personal info (firstName, lastName, bio, phone) AND company fields (companyName, description, website, industry, address, state) in a single request. Returns 403 for non-corporate accounts.',
            security: bearerAuth,
            requestBody: jsonBody('UpdateCorporateProfileRequest'),
            responses: {
                ...r200('Updated user + company'),
                401: r401,
                403: r403,
            },
        },
    },

    [USER_ROUTES.ME_DASHBOARD]: {
        get: {
            tags: ['Users'],
            summary: 'Get user dashboard (role-aware)',
            description:
                'Comprehensive activity snapshot. ' +
                'Individual response: profile · wallet · errand stats (poster + runner) · service listing/order stats · pending items · recent activity · unread count. ' +
                'Corporate response: all of the above + company snapshot (name, logo, verificationStatus, badge, totalSpendNGN, averageRating).',
            security: bearerAuth,
            responses: { ...r200('Dashboard data'), 401: r401 },
        },
    },

    [`/api/v1/users/me/referral`]: {
        get: {
            tags: ['Users'],
            summary: 'Get referral code, link, and QR code',
            description:
                "Returns the user's permanent referral code, a pre-filled signup link " +
                '(`/register?ref=<code>`), and a base64 PNG QR code (brand-coloured) that ' +
                'encodes the signup URL. Use the `qrCode` value directly as an `<img src>`. ' +
                'Nothing extra is stored — all three are generated on demand from the existing referral code.',
            security: bearerAuth,
            responses: {
                ...r200(
                    'referralCode · referralLink · qrCode (data:image/png;base64,...)',
                ),
                401: r401,
            },
        },
    },

    [USER_ROUTES.ME_AVATAR]: {
        post: {
            tags: ['Users'],
            summary: 'Upload / replace profile image (multipart/form-data)',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            required: ['avatar'],
                            properties: {
                                avatar: { type: 'string', format: 'binary' },
                            },
                        },
                    },
                },
            },
            responses: { ...r200('avatarUrl returned'), 400: r400, 401: r401 },
        },
        delete: {
            tags: ['Users'],
            summary: 'Delete profile image',
            security: bearerAuth,
            responses: { ...r200('Image removed'), 400: r400, 401: r401 },
        },
    },

    [USER_ROUTES.ME_COMPANY_LOGO]: {
        post: {
            tags: ['Users'],
            summary:
                'Upload company logo (corporate only, multipart/form-data)',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            required: ['logo'],
                            properties: {
                                logo: { type: 'string', format: 'binary' },
                            },
                        },
                    },
                },
            },
            responses: { ...r200('logoUrl returned'), 401: r401, 403: r403 },
        },
    },

    [USER_ROUTES.ME_SESSIONS]: {
        get: {
            tags: ['Users'],
            summary: 'List active sessions',
            security: bearerAuth,
            responses: { ...r200('Session list'), 401: r401 },
        },
    },

    [USER_ROUTES.SEARCH]: {
        get: {
            tags: ['Users'],
            summary: 'Search users',
            security: bearerAuth,
            parameters: [
                { name: 'q', in: 'query', schema: { type: 'string' } },
                { name: 'role', in: 'query', schema: { type: 'string' } },
                { name: 'isStudent', in: 'query', schema: { type: 'boolean' } },
                ...pagingParams,
            ],
            responses: { ...r200('Paginated user list'), 401: r401 },
        },
    },

    [USER_ROUTES.PUBLIC_PROFILE]: {
        get: {
            tags: ['Users'],
            summary: 'Get public profile',
            security: bearerAuth,
            parameters: [pathParam('userId')],
            responses: { ...r200('Public profile'), 404: r404 },
        },
    },
    [USER_ROUTES.GENERATE_BIO]: {
        get: {
            tags: ['Users'],
            summary: 'Generate AI bio',
            description:
                ' reads the authenticated users profile and skills, generates a bio, and returns it. The frontend just calls it and shows the result for the user to accept or edit. ' +
                'Useful for onboarding or profile enhancement.',
            security: bearerAuth,
            responses: {
                ...r200('Generated bio text'),
                400: r400,
                401: r401,
            },
        },
    },
    [USER_ROUTES.VALIDATE_REFERRAL_CODE]: {
        get: {
            tags: ['Users'],
            summary: 'Validate referral code',
            description:
                'Validates a referral code and returns the referrer details if valid. ' +
                'Use this to show "Referred by John Doe" on the registration page before the user submits.',
            parameters: [
                {
                    name: 'code',
                    in: 'path',
                    required: true,
                    description: 'The referral code to validate',
                    schema: { type: 'string', example: 'ABC123' },
                },
            ],
            responses: {
                ...r200('Referral code is valid, returns referrer info'),
                404: r404,
            },
        },
    },

    [USER_ROUTES.DELETE_ACCOUNT]: {
        delete: {
            tags: ['Users'],
            summary: 'Permanently delete account',
            description:
                "Irreversibly deletes the authenticated user's account along with all associated data " +
                '(errands, orders, services, verifications, wallet, sessions, notifications, skills). ' +
                'Requires the user to confirm by typing `sudo-delete-{firstName} {lastName}` exactly. ' +
                'Blocked if the user has active errands or orders in progress.',
            security: bearerAuth,
            requestBody: jsonBody('DeleteAccountRequest'),
            responses: {
                ...r200('Account permanently deleted'),
                400: r400,
                401: r401,
                409: r409, // active errands/orders
                422: r422, // confirmation text mismatch
            },
        },
    },
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const walletPaths = {
    [WALLET_ROUTES.BALANCE]: {
        get: {
            tags: ['Wallet'],
            summary: 'Get CBC balance',
            security: bearerAuth,
            responses: { ...r200('Balance', 'WalletBalance'), 401: r401 },
        },
    },
    [WALLET_ROUTES.TRANSACTIONS]: {
        get: {
            tags: ['Wallet'],
            summary: 'CBC transaction history (ledger)',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated ledger'), 401: r401 },
        },
    },
    [WALLET_ROUTES.PURCHASE_INITIALIZE]: {
        post: {
            tags: ['Wallet'],
            summary: 'Initialize CBC purchase (Paystack)',
            security: bearerAuth,
            requestBody: jsonBody('InitPurchaseRequest'),
            responses: {
                ...r201('Paystack checkout URL'),
                400: r400,
                401: r401,
            },
        },
    },
    [WALLET_ROUTES.PURCHASE_VERIFY]: {
        get: {
            tags: ['Wallet'],
            summary: 'Verify CBC purchase after redirect',
            security: bearerAuth,
            parameters: [
                {
                    name: 'reference',
                    in: 'query',
                    required: true,
                    schema: { type: 'string' },
                },
            ],
            responses: { ...r200('Verification result'), 400: r400, 401: r401 },
        },
    },
    [WALLET_ROUTES.BANKS]: {
        get: {
            tags: ['Wallet'],
            summary: 'List Nigerian banks for payouts',
            security: bearerAuth,
            responses: { ...r200('Bank list'), 401: r401 },
        },
    },
    [WALLET_ROUTES.WITHDRAWAL_INITIALIZE]: {
        post: {
            tags: ['Wallet'],
            summary: 'Initialize NGN withdrawal to bank account',
            description:
                'Debits CBC immediately. If the Paystack transfer fails, CBC is automatically refunded. Minimum 500 CBC. Only one pending withdrawal allowed at a time.',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: [
                                'cbcAmount',
                                'bankCode',
                                'accountNumber',
                                'accountName',
                                'bankName',
                            ],
                            properties: {
                                cbcAmount: {
                                    type: 'integer',
                                    minimum: 500,
                                    example: 1000,
                                    description:
                                        'Amount in CBC — converted to NGN at platform rate',
                                },
                                bankCode: {
                                    type: 'string',
                                    example: '044',
                                    description:
                                        'Paystack bank code — get from GET /wallet/banks',
                                },
                                accountNumber: {
                                    type: 'string',
                                    minLength: 10,
                                    maxLength: 10,
                                    example: '0123456789',
                                },
                                accountName: {
                                    type: 'string',
                                    example: 'Amara Okafor',
                                },
                                bankName: {
                                    type: 'string',
                                    example: 'Access Bank',
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201(
                    'Withdrawal initiated — CBC debited, transfer processing',
                ),
                400: r400,
                401: r401,
                409: r409,
            },
        },
    },
    [WALLET_ROUTES.WITHDRAWAL_HISTORY]: {
        get: {
            tags: ['Wallet'],
            summary: 'Get withdrawal history',
            security: bearerAuth,
            responses: {
                ...r200('List of past withdrawals with status'),
                401: r401,
            },
        },
    },
}

// ─── Verifications ────────────────────────────────────────────────────────────

export const verificationPaths = {
    [VERIFICATION_ROUTES.SUBMIT]: {
        post: {
            tags: ['Verifications'],
            summary: 'Submit a verification document (multipart/form-data)',
            description:
                'Accepted doc types depend on account type — call GET /allowed-docs first to know which docs apply to the calling user. Max 5 MB. Images (JPEG/PNG/WEBP) and PDF accepted.',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            required: ['document', 'docType'],
                            properties: {
                                document: { type: 'string', format: 'binary' },
                                docType: {
                                    type: 'string',
                                    example: 'student_id',
                                    enum: [
                                        'student_id',
                                        'national_id',
                                        'nin',
                                        'passport',
                                        'voters_card',
                                        'cac',
                                        'director_id',
                                    ],
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201('Document submitted for review'),
                400: r400,
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },

    // ADD
    [VERIFICATION_ROUTES.ALLOWED_DOCS]: {
        get: {
            tags: ['Verifications'],
            summary: 'Get allowed document types for the calling user',
            description:
                'Returns the list of doc types this user is permitted to submit based on their account type (corporate / student / individual). Call this before showing the document upload form.',
            security: bearerAuth,
            responses: {
                200: {
                    description: 'Allowed doc types',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    accountType: {
                                        type: 'string',
                                        enum: [
                                            'student',
                                            'corporate',
                                            'individual',
                                        ],
                                    },
                                    allowedDocTypes: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                docType: { type: 'string' },
                                                label: { type: 'string' },
                                            },
                                        },
                                        example: [
                                            {
                                                docType: 'student_id',
                                                label: 'Student ID',
                                            },
                                            {
                                                docType: 'nin',
                                                label: 'National Identification Number (NIN)',
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
                401: r401,
            },
        },
    },

    [VERIFICATION_ROUTES.MY]: {
        get: {
            tags: ['Verifications'],
            summary: 'List own verification submissions',
            security: bearerAuth,
            responses: { ...r200('Submissions list'), 401: r401 },
        },
    },

    [VERIFICATION_ROUTES.STATUS]: {
        get: {
            tags: ['Verifications'],
            summary: 'Verification tier summary',
            description:
                'Returns emailVerified, phoneVerified, identityStatus, badgeEarned, verificationLevel, verificationTierLabel, and a per-document status list.',
            security: bearerAuth,
            responses: { ...r200('Verification status'), 401: r401 },
        },
    },

    [VERIFICATION_ROUTES.PHONE_SEND_OTP]: {
        post: {
            tags: ['Verifications'],
            summary: 'Send phone verification OTP via SMS (Termii)',
            description:
                'Rate limited: 5 requests per 15 minutes. OTP valid for 10 minutes.',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['phone'],
                            properties: {
                                phone: {
                                    type: 'string',
                                    example: '+2348012345678',
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200('OTP sent — phone number masked in response'),
                400: r400,
                401: r401,
                409: r409,
                429: { description: 'Rate limited' },
            },
        },
    },

    [VERIFICATION_ROUTES.PHONE_VERIFY]: {
        post: {
            tags: ['Verifications'],
            summary: 'Confirm phone OTP and mark isPhoneVerified = true',
            description: 'Rate limited: 5 attempts per 10 minutes.',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['otp'],
                            properties: {
                                otp: {
                                    type: 'string',
                                    minLength: 6,
                                    maxLength: 6,
                                    example: 'A3F2B1',
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200('Phone verified'),
                400: r400,
                401: r401,
                409: r409,
                422: r422,
                429: { description: 'Rate limited' },
            },
        },
    },
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminPaths = {
    [ADMIN_ROUTES.LOGIN]: {
        post: {
            tags: ['Admin'],
            summary: 'Admin login',
            description:
                'Credentials validated against ADMIN_EMAIL and ADMIN_PASSWORD env vars. Admin user is lazily created on first successful login. Rate limited to 10 attempts per 15 minutes.',
            security: [],
            requestBody: jsonBody('LoginRequest'),
            responses: {
                ...r200(
                    'Login successful — returns tokens and admin profile',
                    'AuthResult',
                ),
                401: r401,
                500: {
                    description:
                        'Admin credentials not configured in environment',
                },
            },
        },
    },

    // ── Verifications ─────────────────────────────────────────────
    [ADMIN_ROUTES.VERIFICATIONS]: {
        get: {
            tags: ['Admin'],
            summary: 'List verification submissions',
            security: bearerAuth,
            parameters: [
                {
                    name: 'status',
                    in: 'query',
                    schema: { type: 'string', default: 'pending' },
                },
                { name: 'flagged', in: 'query', schema: { type: 'boolean' } },
                ...pagingParams,
            ],
            responses: {
                ...r200('Paginated submissions'),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.VERIFICATION_DETAIL]: {
        get: {
            tags: ['Admin'],
            summary: 'Get verification submission detail',
            security: bearerAuth,
            parameters: [pathParam('verificationId')],
            responses: {
                ...r200(
                    'Full verification document with populated user, company, reviewer',
                ),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.VERIFICATION_REVIEW]: {
        patch: {
            tags: ['Admin'],
            summary: 'Approve or reject a verification',
            security: bearerAuth,
            parameters: [pathParam('verificationId')],
            requestBody: jsonBody('ReviewVerificationRequest'),
            responses: {
                ...r200(
                    'Review recorded — approval email sent on approve, rejection email sent on reject',
                ),
                400: r400,
                401: r401,
                403: r403,
                404: r404,
                422: r422,
            },
        },
    },

    // ── Users ─────────────────────────────────────────────────────
    [ADMIN_ROUTES.USERS]: {
        get: {
            tags: ['Admin'],
            summary: 'List all users',
            security: bearerAuth,
            parameters: [
                { name: 'role', in: 'query', schema: { type: 'string' } },
                {
                    name: 'isSuspended',
                    in: 'query',
                    schema: { type: 'boolean' },
                },
                ...pagingParams,
            ],
            responses: {
                ...r200('Paginated user list — sensitive fields excluded'),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.USER_DETAIL]: {
        get: {
            tags: ['Admin'],
            summary: 'Get user detail + company',
            security: bearerAuth,
            parameters: [pathParam('userId')],
            responses: {
                ...r200('User document + linked company (if corporate)'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.SUSPEND_USER]: {
        patch: {
            tags: ['Admin'],
            summary: 'Toggle user suspension',
            security: bearerAuth,
            description:
                'Calling this endpoint toggles the suspension state. If user is active → suspends and deactivates. If suspended → unsuspends and reactivates.',
            parameters: [pathParam('userId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['reason'],
                            properties: {
                                reason: {
                                    type: 'string',
                                    minLength: 5,
                                    maxLength: 300,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200('Suspension state updated'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    // ── CBC ───────────────────────────────────────────────────────
    [ADMIN_ROUTES.CBC_CREDIT]: {
        post: {
            tags: ['Admin'],
            summary: 'Manually credit CBC to a user',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['userId', 'amount'],
                            properties: {
                                userId: { type: 'string' },
                                amount: { type: 'integer', minimum: 1 },
                                note: { type: 'string', maxLength: 200 },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200('CBC credited'),
                400: r400,
                401: r401,
                403: r403,
            },
        },
    },

    // ── Errands ────────────────────────────────────────────────────
    [ADMIN_ROUTES.ERRANDS]: {
        get: {
            tags: ['Admin'],
            summary: 'List all errands',
            security: bearerAuth,
            parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } },
                { name: 'category', in: 'query', schema: { type: 'string' } },
                ...pagingParams,
            ],
            responses: {
                ...r200('Paginated errand list'),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.ERRAND_DETAIL]: {
        get: {
            tags: ['Admin'],
            summary: 'Get errand detail',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            responses: {
                ...r200('Full errand with populated poster and runner'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.ERRAND_RESOLVE]: {
        patch: {
            tags: ['Admin'],
            summary: 'Resolve a disputed errand',
            description: `
Resolves a disputed errand based on escrow/payment state.

• favour_poster:
  - Errand is cancelled
  - If payment was held, runner earnings are reversed
  - Poster is eligible for refund (handled via Paystack)

• favour_runner:
  - Errand is marked as confirmed
  - If payment was held, escrow is released
  - If pre-completion, runner is credited directly
  - Earnings enter clearance flow before withdrawal

All parties are notified and actions are logged.
            `,
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['outcome', 'adminNote'],
                            properties: {
                                outcome: {
                                    type: 'string',
                                    enum: ['favour_poster', 'favour_runner'],
                                },
                                adminNote: {
                                    type: 'string',
                                    minLength: 10,
                                    maxLength: 1000,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200(
                    'Dispute resolved — funds adjusted and both parties notified',
                ),
                400: r400,
                401: r401,
                403: r403,
                404: r404,
                409: r409,
            },
        },
    },

    // ── Orders ─────────────────────────────────────────────────────
    [ADMIN_ROUTES.ORDERS]: {
        get: {
            tags: ['Admin'],
            summary: 'List all service orders',
            security: bearerAuth,
            parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } },
                ...pagingParams,
            ],
            responses: {
                ...r200('Paginated order list'),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.ORDER_DETAIL]: {
        get: {
            tags: ['Admin'],
            summary: 'Get order detail',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            responses: {
                ...r200('Full order with populated buyer, seller, and listing'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.ORDER_RESOLVE]: {
        patch: {
            tags: ['Admin'],
            summary: 'Resolve a disputed service order',
            description: `
Resolves a disputed order with financial handling based on delivery state.

• favour_buyer:
  - Order is cancelled
  - If payment was held (post-delivery), seller earnings are reversed
  - Buyer is eligible for refund (handled via Paystack)

• favour_seller:
  - Order is marked as completed
  - If payment was held, escrow is released to seller
  - If pre-delivery, seller is credited directly

All parties are notified and audit logs are recorded.
            `,
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['outcome', 'adminNote'],
                            properties: {
                                outcome: {
                                    type: 'string',
                                    enum: ['favour_buyer', 'favour_seller'],
                                },
                                adminNote: {
                                    type: 'string',
                                    minLength: 10,
                                    maxLength: 1000,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200(
                    'Dispute resolved — funds adjusted and both parties notified',
                ),
                400: r400,
                401: r401,
                403: r403,
                404: r404,
                409: r409,
            },
        },
    },

    // ── Subscriptions ──────────────────────────────────────────────
    [ADMIN_ROUTES.SUBSCRIPTIONS]: {
        get: {
            tags: ['Admin'],
            summary: 'List all subscriptions',
            security: bearerAuth,
            parameters: [
                { name: 'status', in: 'query', schema: { type: 'string' } },
                { name: 'tier', in: 'query', schema: { type: 'string' } },
                ...pagingParams,
            ],
            responses: {
                ...r200('Paginated subscription list'),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.SUBSCRIPTION_DETAIL]: {
        get: {
            tags: ['Admin'],
            summary: 'Get subscription detail',
            security: bearerAuth,
            parameters: [pathParam('subscriptionId')],
            responses: {
                ...r200('Subscription with populated user'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    // ── Clearances ────────────────────────────────────────────────
    [ADMIN_ROUTES.CLEARANCES]: {
        get: {
            tags: ['Admin'],
            summary: 'List earnings clearances',
            security: bearerAuth,
            parameters: [
                {
                    name: 'status',
                    in: 'query',
                    schema: {
                        type: 'string',
                        enum: ['pending', 'approved', 'rejected'],
                        default: 'pending',
                    },
                },
                ...pagingParams,
            ],
            responses: {
                ...r200(
                    'Paginated clearance list with populated user and source',
                ),
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.CLEARANCES_BULK_APPROVE]: {
        post: {
            tags: ['Admin'],
            summary: 'Bulk approve earnings clearances',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['clearanceIds'],
                            properties: {
                                clearanceIds: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    minItems: 1,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200('Bulk result — succeeded and failed counts returned'),
                400: r400,
                401: r401,
                403: r403,
            },
        },
    },

    [ADMIN_ROUTES.CLEARANCE_APPROVE]: {
        patch: {
            tags: ['Admin'],
            summary: 'Approve a single earnings clearance',
            security: bearerAuth,
            parameters: [pathParam('clearanceId')],
            responses: {
                ...r200(
                    'Earnings approved and credited to withdrawable balance',
                ),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.CLEARANCE_REJECT]: {
        patch: {
            tags: ['Admin'],
            summary: 'Reject a single earnings clearance',
            security: bearerAuth,
            parameters: [pathParam('clearanceId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['adminNote'],
                            properties: {
                                adminNote: {
                                    type: 'string',
                                    minLength: 5,
                                    maxLength: 500,
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r200(
                    'Clearance rejected — user notified with appeal deadline',
                ),
                400: r400,
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.CLEARANCE_REAPPROVE]: {
        patch: {
            tags: ['Admin'],
            summary: 'Re-approve a rejected clearance',
            security: bearerAuth,
            parameters: [pathParam('clearanceId')],
            responses: {
                ...r200(
                    'Appeal approved — earnings credited to withdrawable balance',
                ),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },

    // ── Plans ─────────────────────────────────────────────────────
    [ADMIN_ROUTES.LIST_PLANS]: {
        get: {
            tags: ['Admin'],
            summary: 'Get all plans',
            security: bearerAuth,
            responses: {
                ...r200('List of all plans'),
                401: r401,
            },
        },
    },

    [ADMIN_ROUTES.CREATE_PLANS]: {
        post: {
            tags: ['Admin'],
            summary: 'Create a new plan',
            security: bearerAuth,
            requestBody: jsonBody('CreatePlanRequest'),
            responses: {
                ...r201('Plan created'),
                400: r400,
                401: r401,
                409: r409,
            },
        },
    },

    [ADMIN_ROUTES.GET_ONE_PLAN]: {
        get: {
            tags: ['Admin'],
            summary: 'Get one plan',
            security: bearerAuth,
            parameters: [pathParam('id')],
            responses: {
                ...r200('Plan details'),
                401: r401,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.UPDATE_PLANS]: {
        patch: {
            tags: ['Admin'],
            summary: 'Update plan',
            security: bearerAuth,
            parameters: [pathParam('id')],
            requestBody: jsonBody('UpdatePlanRequest'),
            responses: {
                ...r200('Plan updated'),
                400: r400,
                401: r401,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.DELETE_PLAN]: {
        delete: {
            tags: ['Admin'],
            summary: 'Delete plan',
            security: bearerAuth,
            parameters: [pathParam('id')],
            responses: {
                ...r200('Plan deleted'),
                401: r401,
                404: r404,
            },
        },
    },

    [ADMIN_ROUTES.TOGGLE_PLAN]: {
        patch: {
            tags: ['Admin'],
            summary: 'Toggle plan status',
            security: bearerAuth,
            parameters: [pathParam('id')],
            responses: {
                ...r200('Plan status toggled'),
                401: r401,
                404: r404,
            },
        },
    },
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhookPaths = {
    [WEBHOOK_ROUTES.PAYSTACK]: {
        post: {
            tags: ['Webhooks'],
            summary: 'Paystack webhook receiver',
            security: [],
            description:
                'Handles charge.success (CBC purchase, escrow, subscription), transfer.success/failed. Validates HMAC signature. Always returns 200.',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { ...r200('Received') },
        },
    },
}

// ─── Errands ──────────────────────────────────────────────────────────────────

export const errandPaths = {
    [ERRAND_ROUTES.LIST]: {
        get: {
            tags: ['Errands'],
            summary: 'Browse open errands',
            security: [],
            parameters: [
                { name: 'category', in: 'query', schema: { type: 'string' } },
                { name: 'status', in: 'query', schema: { type: 'string' } },
                { name: 'maxBudget', in: 'query', schema: { type: 'number' } },
                ...pagingParams,
            ],
            responses: { ...r200('Paginated errand list with poster name') },
        },
        post: {
            tags: ['Errands'],
            summary: 'Post a new errand (deducts CBC)',
            security: bearerAuth,
            requestBody: jsonBody('PostErrandRequest'),
            responses: {
                ...r201('Errand posted'),
                400: r400,
                401: r401,
                422: r422,
            },
        },
    },
    [ERRAND_ROUTES.MY_POSTED]: {
        get: {
            tags: ['Errands'],
            summary: 'My posted errands',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated list'), 401: r401 },
        },
    },
    [ERRAND_ROUTES.MY_RUNNING]: {
        get: {
            tags: ['Errands'],
            summary: 'Errands I am running (in_progress only)',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated list'), 401: r401 },
        },
    },
    [ERRAND_ROUTES.MY_IN_PROGRESS]: {
        get: {
            tags: ['Errands'],
            summary: 'Errands currently in progress (poster or runner)',
            description:
                'Returns all errands with status in_progress where the authenticated user is either the poster or the assigned runner.',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated list'), 401: r401 },
        },
    },
    [ERRAND_ROUTES.MY_ACCEPTED]: {
        get: {
            tags: ['Errands'],
            summary: 'My errands with an accepted bid (poster)',
            description:
                'Returns errands posted by the authenticated user that have an accepted bid and are awaiting escrow or start.',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated list'), 401: r401 },
        },
    },
    [ERRAND_ROUTES.MY_BIDS]: {
        get: {
            tags: ['Errands'],
            summary: 'All bids I have placed',
            description:
                "Returns every bid the authenticated user has placed across all errands, regardless of bid status (pending, accepted, rejected, withdrawn). Each result includes the errand summary and the user's specific bid.",
            security: bearerAuth,
            parameters: pagingParams,
            responses: {
                ...r200('Paginated list of { errand summary + bid }'),
                401: r401,
            },
        },
    },
    [ERRAND_ROUTES.MY_ACCEPTED_BIDS]: {
        get: {
            tags: ['Errands'],
            summary: 'My accepted bids (runner)',
            description:
                'Returns all bids placed by the authenticated user that have been accepted by a poster. Includes errand details, agreed amount, escrow status, and runner earnings.',
            security: bearerAuth,
            parameters: pagingParams,
            responses: {
                ...r200('Paginated list of { errand summary + accepted bid }'),
                401: r401,
            },
        },
    },
    [ERRAND_ROUTES.ESCROW_PAY]: {
        post: {
            tags: ['Errands'],
            summary: 'Pay for errand (escrow)',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            responses: {
                ...r200(
                    'Payment initialized (returns Paystack authorization URL)',
                ),
                401: r401,
                403: r403,
                404: r404,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.DETAIL]: {
        get: {
            tags: ['Errands'],
            summary: 'Get single errand',
            security: [],
            parameters: [pathParam('errandId')],
            responses: { ...r200('Errand detail'), 404: r404 },
        },
    },
    [ERRAND_ROUTES.BID]: {
        post: {
            tags: ['Errands'],
            summary: 'Place a bid on an errand',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            requestBody: jsonBody('PlaceBidRequest'),
            responses: {
                ...r201('Bid placed'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.ACCEPT_BID]: {
        patch: {
            tags: ['Errands'],
            summary: "Accept a runner's bid (poster)",
            security: bearerAuth,
            parameters: [pathParam('errandId'), pathParam('bidId')],
            responses: {
                ...r200('Bid accepted — escrow reference returned'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },
    [ERRAND_ROUTES.WITHDRAW_BID]: {
        patch: {
            tags: ['Errands'],
            summary: 'Withdraw own bid (runner)',
            security: bearerAuth,
            parameters: [pathParam('errandId'), pathParam('bidId')],
            responses: {
                ...r200('Bid withdrawn'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.START]: {
        patch: {
            tags: ['Errands'],
            summary: 'Mark errand in progress (runner)',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            responses: {
                ...r200('Errand started'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.COMPLETE]: {
        patch: {
            tags: ['Errands'],
            summary: 'Mark errand done + upload proof (runner, multipart)',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            requestBody: {
                required: false,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                proof: { type: 'string', format: 'binary' },
                                note: { type: 'string' },
                            },
                        },
                    },
                },
            },
            responses: { ...r200('Errand completed'), 401: r401, 403: r403 },
        },
    },
    [ERRAND_ROUTES.CONFIRM]: {
        patch: {
            tags: ['Errands'],
            summary: 'Confirm completion → release escrow (poster)',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            responses: {
                ...r200('Confirmed — payment released'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.CANCEL]: {
        patch: {
            tags: ['Errands'],
            summary: 'Cancel errand (poster, before escrow)',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            responses: {
                ...r200('Cancelled'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.DISPUTE]: {
        patch: {
            tags: ['Errands'],
            summary: 'Open a dispute on an errand',
            security: bearerAuth,
            parameters: [pathParam('errandId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['reason'],
                            properties: { reason: { type: 'string' } },
                        },
                    },
                },
            },
            responses: {
                ...r200('Dispute opened'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [ERRAND_ROUTES.ERRAND_MATCHES]: {
        get: {
            tags: ['Errands'],
            summary: 'Get matched runners for an errand',
            description:
                'Returns a ranked list of users (runners) whose skills best match the requirements of the specified errand. ' +
                'Results are limited and sorted by match score (highest first).',
            security: bearerAuth,
            parameters: [
                pathParam('errandId'),
                {
                    name: 'limit',
                    in: 'query',
                    schema: { type: 'number', default: 10 },
                    description: 'Maximum number of matches to return',
                },
            ],
            responses: {
                ...r200('List of matched runners with scores'),
                401: r401,
                404: r404,
            },
        },
    },
}

// ─── Services (listings + orders) ─────────────────────────────────────────────

export const servicePaths = {
    [SERVICE_ROUTES.LIST]: {
        get: {
            tags: ['Services'],
            summary: 'Browse service listings',
            security: [],
            parameters: [
                { name: 'category', in: 'query', schema: { type: 'string' } },
                { name: 'q', in: 'query', schema: { type: 'string' } },
                { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
                ...pagingParams,
            ],
            responses: { ...r200('Paginated listing list') },
        },
        post: {
            tags: ['Services'],
            summary: 'Create a service listing',
            security: bearerAuth,
            requestBody: jsonBody('CreateListingRequest'),
            responses: { ...r201('Listing created'), 400: r400, 401: r401 },
        },
    },
    [SERVICE_ROUTES.MY_LISTINGS]: {
        get: {
            tags: ['Services'],
            summary: 'My service listings',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated list'), 401: r401 },
        },
    },
    [SERVICE_ROUTES.DETAIL]: {
        get: {
            tags: ['Services'],
            summary: 'Get single listing',
            security: [],
            parameters: [pathParam('serviceId')],
            responses: { ...r200('Listing detail'), 404: r404 },
        },
        patch: {
            tags: ['Services'],
            summary: 'Update a listing',
            security: bearerAuth,
            parameters: [pathParam('serviceId')],
            requestBody: jsonBody('UpdateListingRequest'),
            responses: { ...r200('Updated'), 401: r401, 403: r403 },
        },
        delete: {
            tags: ['Services'],
            summary: 'Deactivate a listing',
            security: bearerAuth,
            parameters: [pathParam('serviceId')],
            responses: {
                ...r200('Deactivated'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [SERVICE_ROUTES.PLACE_ORDER]: {
        post: {
            tags: ['Services'],
            summary: 'Place an order (deducts CBC + initializes escrow)',
            security: bearerAuth,
            parameters: [pathParam('serviceId')],
            requestBody: jsonBody('PlaceOrderRequest'),
            responses: {
                ...r201('Order created — escrow reference returned'),
                400: r400,
                401: r401,
                409: r409,
            },
        },
    },
    [SERVICE_ROUTES.MY_ORDERS_BUYING]: {
        get: {
            tags: ['Services'],
            summary: 'My orders as buyer',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated orders'), 401: r401 },
        },
    },
    [SERVICE_ROUTES.MY_ORDERS_SELLING]: {
        get: {
            tags: ['Services'],
            summary: 'My orders as seller',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated orders'), 401: r401 },
        },
    },
    [SERVICE_ROUTES.ORDER_DETAIL]: {
        get: {
            tags: ['Services'],
            summary: 'Get single order (participants only)',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            responses: {
                ...r200('Order detail'),
                401: r401,
                403: r403,
                404: r404,
            },
        },
    },
    [SERVICE_ROUTES.DELIVER]: {
        patch: {
            tags: ['Services'],
            summary: 'Seller marks order delivered',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            requestBody: {
                required: false,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { deliveryNote: { type: 'string' } },
                        },
                    },
                },
            },
            responses: { ...r200('Delivered'), 401: r401, 403: r403 },
        },
    },
    [SERVICE_ROUTES.CONFIRM_DELIVERY]: {
        patch: {
            tags: ['Services'],
            summary: 'Buyer confirms delivery → payment released',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            responses: {
                ...r200('Order completed'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [SERVICE_ROUTES.REQUEST_REVISION]: {
        patch: {
            tags: ['Services'],
            summary: 'Buyer requests revision',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['note'],
                            properties: { note: { type: 'string' } },
                        },
                    },
                },
            },
            responses: {
                ...r200('Revision requested'),
                401: r401,
                403: r403,
                422: r422,
            },
        },
    },
    [SERVICE_ROUTES.DISPUTE_ORDER]: {
        patch: {
            tags: ['Services'],
            summary: 'Open a dispute on an order',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['reason'],
                            properties: { reason: { type: 'string' } },
                        },
                    },
                },
            },
            responses: { ...r200('Dispute opened'), 401: r401, 403: r403 },
        },
    },
    [SERVICE_ROUTES.CANCEL_ORDER]: {
        patch: {
            tags: ['Services'],
            summary: 'Cancel order (before payment confirmation)',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            responses: {
                ...r200('Cancelled'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [SERVICE_ROUTES.SELLER_CANCEL_ORDER]: {
        patch: {
            tags: ['Services'],
            summary: 'Seller cancels order (before delivery confirmation)',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            requestBody: {
                required: false,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { reason: { type: 'string' } },
                        },
                    },
                },
            },
            responses: {
                ...r200('Order cancelled by seller'),
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [SERVICE_ROUTES.ORDER_ESCROW_PAY]: {
        post: {
            tags: ['Services'],
            summary: 'Pay for service order (escrow)',
            security: bearerAuth,
            parameters: [pathParam('orderId')],
            responses: {
                ...r200(
                    'Payment initialized (returns Paystack authorization URL)',
                ),
                401: r401,
                403: r403,
                404: r404,
                409: r409,
            },
        },
    },
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationPaths = {
    [NOTIFICATION_ROUTES.LIST]: {
        get: {
            tags: ['Notifications'],
            summary: 'List in-app notifications',
            security: bearerAuth,
            parameters: pagingParams,
            responses: {
                ...r200('Notification list with unread count'),
                401: r401,
            },
        },
    },
    [NOTIFICATION_ROUTES.MARK_ALL]: {
        patch: {
            tags: ['Notifications'],
            summary: 'Mark all notifications as read',
            security: bearerAuth,
            responses: { ...r200('All read'), 401: r401 },
        },
    },
    [NOTIFICATION_ROUTES.MARK_READ]: {
        patch: {
            tags: ['Notifications'],
            summary: 'Mark a single notification as read',
            security: bearerAuth,
            parameters: [pathParam('notificationId')],
            responses: { ...r200('Marked read'), 401: r401 },
        },
    },
    [NOTIFICATION_ROUTES.DELETE_ONE]: {
        delete: {
            tags: ['Notifications'],
            summary: 'Delete a notification',
            security: bearerAuth,
            parameters: [pathParam('notificationId')],
            responses: { ...r200('Deleted'), 401: r401 },
        },
    },
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptionPaths = {
    // ── Public plans ──────────────────────────────────────────────────────
    [SUBSCRIPTION_ROUTES.PUBLIC_PLANS]: {
        get: {
            tags: ['Subscriptions'],
            summary: 'Get all subscription plans (public)',
            description:
                'Returns all tiers with pricing, benefits, and features. No auth required. Use this for landing pages and pricing pages.',
            security: [],
            responses: {
                ...r200(
                    'All plans — individual and corporate — with full pricing details',
                ),
            },
        },
    },

    // ── Authenticated plans — includes eligibility flags ──────────────────
    [SUBSCRIPTION_ROUTES.PLANS]: {
        get: {
            tags: ['Subscriptions'],
            summary: 'Get subscription plans with eligibility (authenticated)',
            description:
                'Returns all plans with `eligible` and `ineligibleReason` fields computed for the calling user. Use this to drive the in-app upgrade UI — disable buttons where `eligible: false`.',
            security: bearerAuth,
            responses: {
                ...r200(
                    'All plans with eligible flag and ineligibleReason per plan',
                ),
                401: r401,
            },
        },
    },

    [SUBSCRIPTION_ROUTES.MY]: {
        get: {
            tags: ['Subscriptions'],
            summary: 'Get my current subscription',
            security: bearerAuth,
            responses: {
                ...r200(
                    'Current tier, expiry, autoRenew flag, and active subscription record',
                ),
                401: r401,
            },
        },
    },

    [SUBSCRIPTION_ROUTES.SUBSCRIBE]: {
        post: {
            tags: ['Subscriptions'],
            summary: 'Initialize subscription payment (Paystack)',
            description:
                "Creates a PENDING subscription record and returns a Paystack checkout URL. The subscription is activated by the webhook after payment. Pass billingPeriod: 'monthly' (default) or 'yearly' for a discounted annual plan.",
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['tier'],
                            properties: {
                                tier: {
                                    type: 'string',
                                    enum: [
                                        'basic',
                                        'pro',
                                        'elite',
                                        'corporate_pro',
                                        'corporate_elite',
                                    ],
                                },
                                billingPeriod: {
                                    type: 'string',
                                    enum: ['monthly', 'yearly'],
                                    default: 'monthly',
                                },
                                callbackUrl: { type: 'string', format: 'uri' },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201(
                    'Paystack checkout URL + tier + billingPeriod + priceNGN + expiresAt',
                ),
                400: r400,
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },

    [SUBSCRIPTION_ROUTES.CANCEL]: {
        post: {
            tags: ['Subscriptions'],
            summary: 'Cancel active subscription',
            security: bearerAuth,
            description:
                'Cancels the subscription and disables auto-renew. Access to the current tier remains until the expiry date.',
            requestBody: {
                required: false,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { note: { type: 'string' } },
                        },
                    },
                },
            },
            responses: {
                ...r200(
                    'Subscription cancelled — access retained until expiry',
                ),
                401: r401,
                404: r404,
            },
        },
    },

    [SUBSCRIPTION_ROUTES.UPGRADE]: {
        post: {
            tags: ['Subscriptions'],
            summary: 'Upgrade, downgrade, or switch subscription tier',
            description:
                'Cancels the current active subscription and initializes a new Paystack payment for the target tier. The new tier activates via webhook after payment.',
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['tier'],
                            properties: {
                                tier: {
                                    type: 'string',
                                    enum: [
                                        'basic',
                                        'pro',
                                        'elite',
                                        'corporate_pro',
                                        'corporate_elite',
                                    ],
                                },
                                billingPeriod: {
                                    type: 'string',
                                    enum: ['monthly', 'yearly'],
                                    default: 'monthly',
                                },
                                callbackUrl: { type: 'string', format: 'uri' },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201('Paystack checkout URL for new tier'),
                400: r400,
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },

    [SUBSCRIPTION_ROUTES.AUTO_RENEW]: {
        patch: {
            tags: ['Subscriptions'],
            summary: 'Toggle auto-renew on or off',
            description:
                'Toggles the autoRenew flag on the active subscription. When off, the subscription expires naturally without charging the saved card.',
            security: bearerAuth,
            responses: {
                ...r200('New autoRenew state'),
                401: r401,
                404: r404,
            },
        },
    },
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export const chatPaths = {
    [CHAT_ROUTES.ROOMS]: {
        get: {
            tags: ['Chat'],
            summary: 'List all chat rooms',
            description:
                "Returns all order and errand chat rooms the user participates in, sorted by last activity. Each room includes the other party's profile, last message preview, and unread count.",
            security: bearerAuth,
            responses: { ...r200('Room list with unread counts'), 401: r401 },
        },
    },
    [CHAT_ROUTES.MESSAGES]: {
        get: {
            tags: ['Chat'],
            summary: 'Get message history for a room (REST fallback)',
            description:
                "Cursor-based pagination. On first load omit 'before'. Pass the returned 'nextCursor' as 'before' in the next request to load older messages. Messages returned in chronological order (oldest → newest).",
            security: bearerAuth,
            parameters: [
                {
                    name: 'roomId',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        example: 'order:64f1a2b3c4d5e6f7a8b9c0d1',
                    },
                },
                {
                    name: 'before',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'Message ObjectId cursor — load messages older than this ID',
                },
                {
                    name: 'limit',
                    in: 'query',
                    required: false,
                    schema: { type: 'integer', default: 30, maximum: 50 },
                },
            ],
            responses: {
                ...r200('{ messages[], hasMore, nextCursor }'),
                400: r400,
                401: r401,
                403: r403,
            },
        },
        post: {
            tags: ['Chat'],
            summary: 'Send a message (REST fallback)',
            description:
                "Use this when a persistent socket connection is unavailable (mobile background, unstable network). The message is pushed to the recipient's socket in real time if they are online. An in-app push notification is sent if they are offline.",
            security: bearerAuth,
            parameters: [
                {
                    name: 'roomId',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        example: 'order:64f1a2b3c4d5e6f7a8b9c0d1',
                    },
                },
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['content'],
                            properties: {
                                content: {
                                    type: 'string',
                                    minLength: 1,
                                    maxLength: 4000,
                                },
                                replyToId: {
                                    type: 'string',
                                    description:
                                        'Parent message _id for reply threads',
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201('Message created and delivered/queued'),
                400: r400,
                401: r401,
                403: r403,
            },
        },
    },

    [CHAT_ROUTES.READ]: {
        put: {
            tags: ['Chat'],
            summary: 'Mark all messages in a room as read',
            description:
                'Call this when the user opens a conversation. Marks all unread messages as read and resets the unread badge. Also notifies the sender via socket that their messages were read.',
            security: bearerAuth,
            parameters: [
                {
                    name: 'roomId',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        example: 'order:64f1a2b3c4d5e6f7a8b9c0d1',
                    },
                },
            ],
            responses: {
                ...r200('Messages marked as read'),
                401: r401,
                403: r403,
            },
        },
    },
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const reviewPaths = {
    [`/api/v1/reviews`]: {
        post: {
            tags: ['Reviews'],
            summary: 'Submit a review',
            description:
                "Buyer reviews seller after order is completed. Poster reviews runner after errand is confirmed. One review per transaction. Updates reviewee's averageRating on their profile.",
            security: bearerAuth,
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['refId', 'refType', 'rating'],
                            properties: {
                                refId: {
                                    type: 'string',
                                    description: 'orderId or errandId',
                                },
                                refType: {
                                    type: 'string',
                                    enum: ['order', 'errand'],
                                },
                                rating: {
                                    type: 'integer',
                                    minimum: 1,
                                    maximum: 5,
                                },
                                comment: { type: 'string', maxLength: 1500 },
                            },
                        },
                    },
                },
            },
            responses: {
                ...r201('Review submitted — averageRating updated'),
                400: r400,
                401: r401,
                403: r403,
                409: r409,
            },
        },
    },
    [`/api/v1/reviews/mine`]: {
        get: {
            tags: ['Reviews'],
            summary: 'Get reviews the authenticated user has written',
            security: bearerAuth,
            parameters: pagingParams,
            responses: { ...r200('Paginated reviews'), 401: r401 },
        },
    },
    [`/api/v1/reviews/{userId}`]: {
        get: {
            tags: ['Reviews'],
            summary: 'Get reviews received by a user (public)',
            parameters: [pathParam('userId'), ...pagingParams],
            responses: {
                ...r200('Paginated reviews with reviewer populated'),
                404: r404,
            },
        },
    },
}

// ─── Skills ────────────────────────────────────────────────────────────────

export const skillPaths = {
    [SKILL_ROUTES.BASE]: {
        get: {
            tags: ['Skills'],
            summary: 'Get my skills',
            description:
                'Returns all skills belonging to the authenticated user.',
            security: bearerAuth,
            responses: { ...r200('List of skills'), 401: r401 },
        },
        post: {
            tags: ['Skills'],
            summary: 'Add a new skill',
            description: 'Creates a new skill for the authenticated user.',
            security: bearerAuth,
            requestBody: jsonBody('AddSkillRequest'),
            responses: { ...r200('Skill created'), 400: r400, 401: r401 },
        },
    },

    [SKILL_ROUTES.BY_ID]: {
        patch: {
            tags: ['Skills'],
            summary: 'Update a skill',
            description: 'Updates a specific skill by ID.',
            security: bearerAuth,
            parameters: [pathParam('skillId')],
            requestBody: jsonBody('UpdateSkillRequest'),
            responses: {
                ...r200('Skill updated'),
                400: r400,
                401: r401,
                404: r404,
            },
        },
        delete: {
            tags: ['Skills'],
            summary: 'Delete a skill',
            description: 'Removes a skill from the authenticated user.',
            security: bearerAuth,
            parameters: [pathParam('skillId')],
            responses: { ...r200('Skill deleted'), 401: r401, 404: r404 },
        },
    },

    [SKILL_ROUTES.USER_SKILLS]: {
        get: {
            tags: ['Skills'],
            summary: 'Get skills of a user',
            description: 'Fetch all skills belonging to a specific user.',
            security: bearerAuth,
            parameters: [pathParam('userId')],
            responses: { ...r200('User skills'), 404: r404 },
        },
    },

    // [SKILL_ROUTES.MATCH_ERRAND]: {
    //   get: {
    //     tags: ["Skills"],
    //     summary: "Match runners for an errand",
    //     description:
    //       "Finds and ranks users (runners) whose skills best match the requirements of a given errand.",
    //     security: bearerAuth,
    //     parameters: [pathParam("errandId")],
    //     responses: { ...r200("Matched runners"), 404: r404 },
    //   },
    // },
}

export const planPaths = {}

export const allPaths = {
    ...authPaths,
    ...userPaths,
    ...walletPaths,
    ...verificationPaths,
    ...adminPaths,
    ...webhookPaths,
    ...errandPaths,
    ...servicePaths,
    ...notificationPaths,
    ...subscriptionPaths,
    ...chatPaths,
    ...reviewPaths,
    ...skillPaths,
    ...planPaths,
}
