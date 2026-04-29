export const APP_NAME = 'Campus Baze'
export const EMAIL_FROM = process.env.EMAIL_FROM || 'support@campusbaze.com'

// ─── Verification ─────────────────────────────────────────────────────────────
export const VERIFICATION_STATUS = {
    UNVERIFIED: 'unverified',
    VERIFIED: 'verified',
    PENDING: 'pending',
    REJECTED: 'rejected',
} as const

export const VERIFICATION_LEVEL = {
    NONE: 0,
    TIER_0: 0,
    TIER_1: 1,
    TIER_2: 2,
} as const

export const DOC_LEVEL_MAP: Record<string, number> = {
    student_id: 1,
    national_id: 1,
    nin: 1,
    passport: 1,
    voters_card: 1,
    cac: 1,
    director_id: 1,
}

export const ALLOWED_DOC_TYPES: Record<string, string[]> = {
    corporate: [
        'cac',         // company entity verification
        'director_id', // director personal ID
    ],
    student: [
        'student_id',  // Tier 1A
        'nin',         // also acceptable for students
    ],
    individual: [
        'national_id',
        'nin',
        'passport',
        'voters_card',
    ],
}

export const IDENTITY_BADGE = {
    NONE: 'none',
    STUDENT_VERIFIED: 'student_verified', // Tier 1A
    ID_VERIFIED: 'id_verified', // Tier 1B
    GOLD_VERIFIED: 'gold_verified', // Tier 2 — phone + doc
    CORPORATE: 'corporate_verified',
} as const

export type IdentityBadge = (typeof IDENTITY_BADGE)[keyof typeof IDENTITY_BADGE]

export const MIN_WITHDRAWAL_NGN = 500
// ─── User roles ───────────────────────────────────────────────────────────────
export const USER_ROLE = {
    STUDENT: 'student',
    ALUMNI: 'alumni',
    PROFESSIONAL: 'professional',
    CORPORATE: 'corporate',
    ADMIN: 'admin',
} as const

// ─── Subscription tiers ───────────────────────────────────────────────────────
export const SUBSCRIPTION_TIER = {
    FREE: 'free',
    BASIC: 'basic',
    PRO: 'pro',
    ELITE: 'elite',
    CORPORATE_FREE: 'corporate_free',
    CORPORATE_PRO: 'corporate_pro',
    CORPORATE_ELITE: 'corporate_elite',
} as const

export type SubscriptionTier =
    (typeof SUBSCRIPTION_TIER)[keyof typeof SUBSCRIPTION_TIER]

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const OTP_EXPIRES_MINUTES = 10
export const ACCESS_TOKEN_EXPIRES = '15m'
export const REFRESH_TOKEN_EXPIRES = '30d'

// ─── CBC welcome bonuses (PRD-aligned) ────────────────────────────────────────
export const CBC_WELCOME_INDIVIDUAL = 100 // 100 CBC on verified individual registration
export const CBC_WELCOME_CORPORATE = 200 // 200 CBC on verified corporate registration  ← was 500

// ─── Referral rewards ─────────────────────────────────────────────────────────
export const REFERRAL_REWARD_INDIVIDUAL = 100 // CBC to referrer on referee's first transaction
export const REFERRAL_REWARD_CORPORATE = 250 // CBC to referrer on corporate referee's first transaction

// ─── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ─── Rate limiting ────────────────────────────────────────────────────────────
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const AUTH_RATE_LIMIT_MAX = 10
export const API_RATE_LIMIT_WINDOW_MS = 60 * 1000
export const API_RATE_LIMIT_MAX = 60

// ─── Service listing categories ───────────────────────────────────────────────
export const SERVICE_CATEGORY = {
    GRAPHIC_DESIGN: 'graphic_design',
    CONTENT_WRITING: 'content_writing',
    PROGRAMMING: 'programming',
    WEB_DEV: 'web_dev',
    TUTORING: 'tutoring',
    VIDEO_PRODUCTION: 'video_production',
    DIGITAL_MARKETING: 'digital_marketing',
    MUSIC_AUDIO: 'music_audio',
    LEGAL: 'legal',
    ENGINEERING: 'engineering',
    TRANSLATION: 'translation',
    CONSULTING: 'consulting',
    DATA_ANALYTICS: 'data_analytics',
    OTHER: 'other',
} as const

export type ServiceCategory =
    (typeof SERVICE_CATEGORY)[keyof typeof SERVICE_CATEGORY]

// ─── Errand categories ────────────────────────────────────────────────────────
export const ERRAND_CATEGORY = {
    DELIVERY_PICKUP: 'delivery_pickup',
    GROCERY_SHOPPING: 'grocery_shopping',
    PRINTING_BINDING: 'printing_binding',
    FOOD_RUNS: 'food_runs',
    CLEANING_LAUNDRY: 'cleaning_laundry',
    MOVING_ASSISTANCE: 'moving_assistance',
    TYPING_FORM_FILLING: 'typing_form_filling',
    QUEUE_STANDING: 'queue_standing',
    PET_CARE: 'pet_care',
    OTHER: 'other',
} as const

export type ErrandCategory =
    (typeof ERRAND_CATEGORY)[keyof typeof ERRAND_CATEGORY]

// ─── Errand lifecycle ─────────────────────────────────────────────────────────
export const ERRAND_STATUS = {
    POSTED: 'posted',
    ACCEPTED: 'accepted', // runner's bid was accepted + escrow charged
    IN_PROGRESS: 'in_progress', // runner marks started
    COMPLETED: 'completed', // runner marks done, uploads proof
    CONFIRMED: 'confirmed', // poster confirms → escrow released
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed',
} as const

export type ErrandStatus = (typeof ERRAND_STATUS)[keyof typeof ERRAND_STATUS]

// ─── Bid status ───────────────────────────────────────────────────────────────
export const BID_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn',
} as const

export type BidStatus = (typeof BID_STATUS)[keyof typeof BID_STATUS]

// ─── Service listing status ───────────────────────────────────────────────────
export const LISTING_STATUS = {
    ACTIVE: 'active',
    PAUSED: 'paused',
    DRAFT: 'draft',
} as const

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS]

// ─── Service order lifecycle ──────────────────────────────────────────────────
export const ORDER_STATUS = {
    PENDING_PAYMENT: 'pending_payment', // Paystack initialized, awaiting confirmation
    IN_PROGRESS: 'in_progress', // payment confirmed via webhook
    DELIVERED: 'delivered', // seller marks delivered
    COMPLETED: 'completed', // buyer confirms → commission deducted, seller paid
    REVISION: 'revision', // buyer requests revision
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed',
} as const

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

// ─── Subscription billing status ─────────────────────────────────────────────
export const SUBSCRIPTION_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    RENEWING: 'renewing',
    CANCELLED: 'cancelled',
    PENDING: 'pending',
} as const

export type SubscriptionStatus =
    (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS]

// ─── In-app notification types ────────────────────────────────────────────────
export const NOTIFICATION_TYPE = {
    ORDER_UPDATE: 'order_update',
    PAYMENT: 'payment',
    CBC_CREDIT: 'cbc_credit',
    REFERRAL: 'referral',
    VERIFICATION: 'verification',
    NEW_MESSAGE: 'new_message',
    NEW_BID: 'new_bid',
    ERRAND_UPDATE: 'errand_update',
    SUBSCRIPTION_ACTIVATED: 'subscription_activated',
    SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
    SYSTEM: 'system',
} as const

export type NotificationType =
    (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE]

// ─── Commission rates by subscription tier ────────────────────────────────────
// standard = non-student rate; student = verified student rate
// export const COMMISSION_RATES: Readonly<
//     Record<string, { readonly standard: number; readonly student: number }>
// > = {
//     free: { standard: 0.15, student: 0.12 },
//     basic: { standard: 0.12, student: 0.09 },
//     pro: { standard: 0.09, student: 0.07 },
//     elite: { standard: 0.07, student: 0.055 },
//     corporate_free: { standard: 0.17, student: 0.17 },
//     corporate_pro: { standard: 0.11, student: 0.11 },
//     corporate_elite: { standard: 0.09, student: 0.09 },
// }

export const CORPORATE_SURCHARGE = 2

// ─── CBC contact fee table (amount in NGN) ────────────────────────────────────
// Debited from buyer when they contact a seller or post/accept an errand.
export const CBC_FEE_TABLE: ReadonlyArray<{
    readonly maxNGN: number
    readonly student: number
    readonly standard: number
}> = [
    { maxNGN: 999, student: 10, standard: 15 },
    { maxNGN: 4_999, student: 20, standard: 35 },
    { maxNGN: 14_999, student: 40, standard: 70 },
    { maxNGN: 29_999, student: 80, standard: 150 },
    { maxNGN: 74_999, student: 200, standard: 350 },
    { maxNGN: 149_999, student: 400, standard: 700 },
    { maxNGN: Infinity, student: 1000, standard: 1000 },
]
