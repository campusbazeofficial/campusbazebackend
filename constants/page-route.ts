// ─── Base prefixes (match server.ts mount points) ────────────────────────────

export const AUTH_BASE = '/api/v1/auth'
export const USER_BASE = '/api/v1/users'
export const WALLET_BASE = '/api/v1/wallet'
export const VERIFICATION_BASE = '/api/v1/verifications'
export const ADMIN_BASE = '/api/v1/admin'
export const WEBHOOK_BASE = '/api/v1/webhooks'
export const ERRAND_BASE = '/api/v1/errands'
export const SERVICE_BASE = '/api/v1/services'
export const NOTIFICATION_BASE = '/api/v1/notifications'
export const SUBSCRIPTION_BASE = '/api/v1/subscriptions'
export const CHAT_BASE = '/api/v1/chat'
export const SKILL_BASE = '/api/v1/skills'
// export const PLAN_BASE = '/api/v1/plans'

// ─── Relative path segments (used inside Express Router) ─────────────────────

export const AUTH_PATHS = {
    REGISTER: '/register',
    REGISTER_CORPORATE: '/register/corporate',
    VERIFY_EMAIL: '/verify-email',
    RESEND_OTP: '/resend-otp',
    LOGIN: '/login',
    REFRESH: '/refresh',
    LOGOUT: '/logout',
    LOGOUT_ALL: '/logout-all',
    REVOKE_SESSION: '/sessions/:sessionId',
    FORGOT_PASSWORD: '/forgot-password',
    RESET_PASSWORD: '/reset-password',
    CHANGE_PASSWORD: '/change-password',
} as const

export const USER_PATHS = {
    ME: '/me',
    ME_DASHBOARD: '/me/dashboard',
    ME_AVATAR: '/me/avatar',
    ME_SESSIONS: '/me/sessions',
    ME_CORPORATE: '/me/corporate', // corporate profile update (director + company)
    ME_COMPANY_LOGO: '/me/company/logo',
    SEARCH: '/search',
    PUBLIC_PROFILE: '/:identifier/profile',
    GENERATE_BIO: '/generate-bio',
    VALIDATE_REFERRAL_CODE: '/referral/validate/:code',
    DELETE_ACCOUNT: '/delete-account',
} as const

export const WALLET_PATHS = {
    BALANCE: '/balance',
    TRANSACTIONS: '/transactions',
    PURCHASE_INITIALIZE: '/purchase/initialize',
    PURCHASE_VERIFY: '/purchase/verify',
    BANKS: '/banks',
    WITHDRAWAL_INITIALIZE: '/withdrawal/initialize',
    WITHDRAWAL_HISTORY: '/withdrawal/history',
} as const

export const VERIFICATION_PATHS = {
    SUBMIT: '/',
    MY: '/my',
    STATUS: '/status',
    ALLOWED_DOCS: '/allowed-docs',
    PHONE_SEND_OTP: '/phone/send-otp',
    PHONE_VERIFY: '/phone/verify',
} as const

export const ADMIN_PATHS = {
    LOGIN: '/login',
    VERIFICATIONS: '/verifications',
    VERIFICATION_DETAIL: '/verifications/:verificationId',
    VERIFICATION_REVIEW: '/verifications/:verificationId/review',
    USERS: '/users',
    USER_DETAIL: '/users/:userId',
    SUSPEND_USER: '/users/:userId/suspend',
    CBC_CREDIT: '/cbc/credit',
    ERRANDS: '/errands',
    ERRAND_DETAIL: '/errands/:errandId',
    ERRAND_RESOLVE: '/errands/:errandId/resolve',
    ORDERS: '/orders',
    ORDER_DETAIL: '/orders/:orderId',
    ORDER_RESOLVE: '/orders/:orderId/resolve',
    SUBSCRIPTIONS: '/subscriptions',
    SUBSCRIPTION_DETAIL: '/subscriptions/:subscriptionId',
    CLEARANCES: '/clearances',
    CLEARANCE_APPROVE: '/clearances/:clearanceId/approve',
    CLEARANCE_REJECT: '/clearances/:clearanceId/reject',
    CLEARANCE_REAPPROVE: '/clearances/:clearanceId/reapprove',
    CLEARANCES_BULK_APPROVE: '/clearances/bulk-approve',
    CREATE_PLANS: '/plan/create',
    LIST_PLANS: '/plan/list',
    GET_ONE_PLAN: '/plan/:id',
    UPDATE_PLANS: '/plan/:id/update',
    DELETE_PLAN: '/plan/:id/delete',
    TOGGLE_PLAN: '/plan/:id/toggle',
} as const

export const WEBHOOK_PATHS = {
    PAYSTACK: '/paystack',
} as const

export const ERRAND_PATHS = {
    LIST: '/',
    MY_POSTED: '/my/posted',
    MY_RUNNING: '/my/running',
    MY_IN_PROGRESS: '/my/in-progress', // ← new
    MY_ACCEPTED: '/my/accepted', // ← new (poster view: errands with accepted bids)
    MY_BIDS: '/my/bids',
    MY_ACCEPTED_BIDS: '/my/bids/accepted', // ← new (runner view: their accepted bids)
    ESCROW_PAY: '/:errandId/pay',
    DETAIL: '/:errandId',
    BID: '/:errandId/bids',
    ACCEPT_BID: '/:errandId/bids/:bidId/accept',
    WITHDRAW_BID: '/:errandId/bids/:bidId/withdraw',
    START: '/:errandId/start',
    ERRAND_MATCHES: '/:errandId/matches',
    COMPLETE: '/:errandId/complete',
    CONFIRM: '/:errandId/confirm',
    CANCEL: '/:errandId/cancel',
    DISPUTE: '/:errandId/dispute',
} as const

export const SERVICE_PATHS = {
    LIST: '/',
    MY_LISTINGS: '/my/listings',
    DETAIL: '/:serviceId',
    UPDATE: '/:serviceId',
    DELETE: '/:serviceId',
    PLACE_ORDER: '/:serviceId/orders',
    MY_ORDERS_BUYING: '/orders/buying',
    MY_ORDERS_SELLING: '/orders/selling',
    ORDER_DETAIL: '/orders/:orderId',
    DELIVER: '/orders/:orderId/deliver',
    CONFIRM_DELIVERY: '/orders/:orderId/confirm',
    REQUEST_REVISION: '/orders/:orderId/revision',
    DISPUTE_ORDER: '/orders/:orderId/dispute',
    CANCEL_ORDER: '/orders/:orderId/cancel',
    ORDER_ESCROW_PAY: '/orders/:orderId/pay',
    SELLER_CANCEL_ORDER: '/orders/:orderId/seller-cancel',
} as const

export const NOTIFICATION_PATHS = {
    LIST: '/',
    MARK_READ: '/:notificationId/read',
    MARK_ALL: '/read-all',
    DELETE_ONE: '/:notificationId',
} as const

export const SUBSCRIPTION_PATHS = {
    PUBLIC_PLANS: '/plans/public',
    PLANS: '/plans',
    MY: '/my',
    SUBSCRIBE: '/subscribe',
    VERIFY: '/verify',
    CANCEL: '/cancel',
    UPGRADE: '/upgrade',
    AUTO_RENEW: '/auto-renew',
} as const

export const CHAT_PATHS = {
    ROOMS: '/rooms',
    MESSAGES: '/:roomId/messages',
    READ: '/:roomId/read',
} as const

export const SKILL_PATHS = {
    BASE: '/',
    BY_ID: '/:skillId',
    USER_SKILLS: '/user/:userId',
    // MATCH_ERRAND: '/match/:errandId',
} as const

// export const PLAN_PATHS = {
//     CREATE_PLANS: '/create',
//     LIST_PLANS: '/list',
//     GET_ONE_PLAN: '/:id',
//     UPDATE_PLAN: '/:id',
//     DELETE_PLAN: '/:id',
//     TOGGLE_PLAN: '/:id/toggle',
// } as const

// ─── Full URLs (used in Swagger path definitions only) ────────────────────────

const full = (base: string, path: string): string =>
    `${base}${path === '/' ? '' : path}`

export const AUTH_ROUTES = {
    REGISTER: full(AUTH_BASE, AUTH_PATHS.REGISTER),
    REGISTER_CORPORATE: full(AUTH_BASE, AUTH_PATHS.REGISTER_CORPORATE),
    VERIFY_EMAIL: full(AUTH_BASE, AUTH_PATHS.VERIFY_EMAIL),
    RESEND_OTP: full(AUTH_BASE, AUTH_PATHS.RESEND_OTP),
    LOGIN: full(AUTH_BASE, AUTH_PATHS.LOGIN),
    REFRESH: full(AUTH_BASE, AUTH_PATHS.REFRESH),
    LOGOUT: full(AUTH_BASE, AUTH_PATHS.LOGOUT),
    LOGOUT_ALL: full(AUTH_BASE, AUTH_PATHS.LOGOUT_ALL),
    FORGOT_PASSWORD: full(AUTH_BASE, AUTH_PATHS.FORGOT_PASSWORD),
    RESET_PASSWORD: full(AUTH_BASE, AUTH_PATHS.RESET_PASSWORD),
    REVOKE_SESSION: `${AUTH_BASE}/sessions/{sessionId}`,
    CHANGE_PASSWORD: full(AUTH_BASE, AUTH_PATHS.CHANGE_PASSWORD),
} as const

export const USER_ROUTES = {
    ME: full(USER_BASE, USER_PATHS.ME),
    ME_DASHBOARD: full(USER_BASE, USER_PATHS.ME_DASHBOARD),
    ME_AVATAR: full(USER_BASE, USER_PATHS.ME_AVATAR),
    ME_SESSIONS: full(USER_BASE, USER_PATHS.ME_SESSIONS),
    ME_CORPORATE: full(USER_BASE, USER_PATHS.ME_CORPORATE),
    ME_COMPANY_LOGO: full(USER_BASE, USER_PATHS.ME_COMPANY_LOGO),
    SEARCH: full(USER_BASE, USER_PATHS.SEARCH),
    PUBLIC_PROFILE: `${USER_BASE}/{identifier}/profile`,
    VALIDATE_REFERRAL_CODE: `${USER_BASE}/referral/validate/{code}`,
    GENERATE_BIO: full(USER_BASE, USER_PATHS.GENERATE_BIO),
    DELETE_ACCOUNT: full(USER_BASE, USER_PATHS.DELETE_ACCOUNT),
} as const

export const WALLET_ROUTES = {
    BALANCE: full(WALLET_BASE, WALLET_PATHS.BALANCE),
    TRANSACTIONS: full(WALLET_BASE, WALLET_PATHS.TRANSACTIONS),
    PURCHASE_INITIALIZE: full(WALLET_BASE, WALLET_PATHS.PURCHASE_INITIALIZE),
    PURCHASE_VERIFY: full(WALLET_BASE, WALLET_PATHS.PURCHASE_VERIFY),
    BANKS: full(WALLET_BASE, WALLET_PATHS.BANKS),
    WITHDRAWAL_INITIALIZE: full(
        WALLET_BASE,
        WALLET_PATHS.WITHDRAWAL_INITIALIZE,
    ),
    WITHDRAWAL_HISTORY: full(WALLET_BASE, WALLET_PATHS.WITHDRAWAL_HISTORY),
} as const

export const VERIFICATION_ROUTES = {
    SUBMIT: VERIFICATION_BASE,
    MY: full(VERIFICATION_BASE, VERIFICATION_PATHS.MY),
    STATUS: full(VERIFICATION_BASE, VERIFICATION_PATHS.STATUS),
    ALLOWED_DOCS: full(VERIFICATION_BASE, VERIFICATION_PATHS.ALLOWED_DOCS),
    PHONE_SEND_OTP: full(VERIFICATION_BASE, VERIFICATION_PATHS.PHONE_SEND_OTP),
    PHONE_VERIFY: full(VERIFICATION_BASE, VERIFICATION_PATHS.PHONE_VERIFY),
} as const

export const ADMIN_ROUTES = {
    LOGIN: full(ADMIN_BASE, ADMIN_PATHS.LOGIN),
    VERIFICATIONS: full(ADMIN_BASE, ADMIN_PATHS.VERIFICATIONS),
    VERIFICATION_DETAIL: `${ADMIN_BASE}/verifications/{verificationId}`,
    VERIFICATION_REVIEW: `${ADMIN_BASE}/verifications/{verificationId}/review`,
    USERS: full(ADMIN_BASE, ADMIN_PATHS.USERS),
    USER_DETAIL: `${ADMIN_BASE}/users/{userId}`,
    SUSPEND_USER: `${ADMIN_BASE}/users/{userId}/suspend`,
    CBC_CREDIT: full(ADMIN_BASE, ADMIN_PATHS.CBC_CREDIT),
    ERRANDS: full(ADMIN_BASE, ADMIN_PATHS.ERRANDS),
    ERRAND_DETAIL: `${ADMIN_BASE}/errands/{errandId}`,
    ERRAND_RESOLVE: `${ADMIN_BASE}/errands/{errandId}/resolve`,
    ORDERS: full(ADMIN_BASE, ADMIN_PATHS.ORDERS),
    ORDER_DETAIL: `${ADMIN_BASE}/orders/{orderId}`,
    ORDER_RESOLVE: `${ADMIN_BASE}/orders/{orderId}/resolve`,
    SUBSCRIPTIONS: full(ADMIN_BASE, ADMIN_PATHS.SUBSCRIPTIONS),
    SUBSCRIPTION_DETAIL: `${ADMIN_BASE}/subscriptions/{subscriptionId}`,
    CLEARANCES: full(ADMIN_BASE, ADMIN_PATHS.CLEARANCES),
    CLEARANCE_APPROVE: `${ADMIN_BASE}/clearances/{clearanceId}/approve`,
    CLEARANCE_REJECT: `${ADMIN_BASE}/clearances/{clearanceId}/reject`,
    CLEARANCE_REAPPROVE: `${ADMIN_BASE}/clearances/{clearanceId}/reapprove`,
    CLEARANCES_BULK_APPROVE: full(
        ADMIN_BASE,
        ADMIN_PATHS.CLEARANCES_BULK_APPROVE,
    ),
    CREATE_PLANS: '/plan/create',
    LIST_PLANS: '/plan/list',
    GET_ONE_PLAN: '/plan/{id}',
    UPDATE_PLANS: '/plan/{id}/update',
    DELETE_PLAN: '/plan/{id}/delete',
    TOGGLE_PLAN: '/plan/{id}/toggle',
} as const

export const WEBHOOK_ROUTES = {
    PAYSTACK: full(WEBHOOK_BASE, WEBHOOK_PATHS.PAYSTACK),
} as const

export const ERRAND_ROUTES = {
    LIST: ERRAND_BASE,
    MY_POSTED: full(ERRAND_BASE, ERRAND_PATHS.MY_POSTED),
    MY_RUNNING: full(ERRAND_BASE, ERRAND_PATHS.MY_RUNNING),
    MY_IN_PROGRESS: full(ERRAND_BASE, ERRAND_PATHS.MY_IN_PROGRESS), // ← new
    MY_ACCEPTED: full(ERRAND_BASE, ERRAND_PATHS.MY_ACCEPTED), // ← new
    MY_BIDS: full(ERRAND_BASE, ERRAND_PATHS.MY_BIDS),
    MY_ACCEPTED_BIDS: full(ERRAND_BASE, ERRAND_PATHS.MY_ACCEPTED_BIDS), // ← new
    ESCROW_PAY: `${ERRAND_BASE}/{errandId}/pay`,
    ERRAND_MATCHES: `${ERRAND_BASE}/{errandId}/matches`,
    DETAIL: `${ERRAND_BASE}/{errandId}`,
    BID: `${ERRAND_BASE}/{errandId}/bids`,
    ACCEPT_BID: `${ERRAND_BASE}/{errandId}/bids/{bidId}/accept`,
    WITHDRAW_BID: `${ERRAND_BASE}/{errandId}/bids/{bidId}/withdraw`,
    START: `${ERRAND_BASE}/{errandId}/start`,
    COMPLETE: `${ERRAND_BASE}/{errandId}/complete`,
    CONFIRM: `${ERRAND_BASE}/{errandId}/confirm`,
    CANCEL: `${ERRAND_BASE}/{errandId}/cancel`,
    DISPUTE: `${ERRAND_BASE}/{errandId}/dispute`,
} as const

export const SERVICE_ROUTES = {
    LIST: SERVICE_BASE,
    MY_LISTINGS: full(SERVICE_BASE, SERVICE_PATHS.MY_LISTINGS),
    DETAIL: `${SERVICE_BASE}/{serviceId}`,
    PLACE_ORDER: `${SERVICE_BASE}/{serviceId}/orders`,
    MY_ORDERS_BUYING: full(SERVICE_BASE, SERVICE_PATHS.MY_ORDERS_BUYING),
    MY_ORDERS_SELLING: full(SERVICE_BASE, SERVICE_PATHS.MY_ORDERS_SELLING),
    ORDER_DETAIL: `${SERVICE_BASE}/orders/{orderId}`,
    UPDATE: `${SERVICE_BASE}/{serviceId}`,
    DELETE: `${SERVICE_BASE}/{serviceId}`,
    DELIVER: `${SERVICE_BASE}/orders/{orderId}/deliver`,
    CONFIRM_DELIVERY: `${SERVICE_BASE}/orders/{orderId}/confirm`,
    ORDER_ESCROW_PAY: `${SERVICE_BASE}/orders/{orderId}/pay`,
    REQUEST_REVISION: `${SERVICE_BASE}/orders/{orderId}/revision`,
    DISPUTE_ORDER: `${SERVICE_BASE}/orders/{orderId}/dispute`,
    SELLER_CANCEL_ORDER: `${SERVICE_BASE}/orders/{orderId}/seller-cancel`,
    CANCEL_ORDER: `${SERVICE_BASE}/orders/{orderId}/cancel`,
} as const

export const NOTIFICATION_ROUTES = {
    LIST: NOTIFICATION_BASE,
    MARK_READ: `${NOTIFICATION_BASE}/{notificationId}/read`,
    MARK_ALL: full(NOTIFICATION_BASE, NOTIFICATION_PATHS.MARK_ALL),
    DELETE_ONE: `${NOTIFICATION_BASE}/{notificationId}`,
} as const

export const SUBSCRIPTION_ROUTES = {
    PUBLIC_PLANS: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.PUBLIC_PLANS),
    PLANS: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.PLANS),
    MY: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.MY),
    SUBSCRIBE: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.SUBSCRIBE),
    VERIFY: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.VERIFY),
    CANCEL: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.CANCEL),
    UPGRADE: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.UPGRADE),
    AUTO_RENEW: full(SUBSCRIPTION_BASE, SUBSCRIPTION_PATHS.AUTO_RENEW),
} as const

export const CHAT_ROUTES = {
    ROOMS: full(CHAT_BASE, CHAT_PATHS.ROOMS),
    MESSAGES: `${CHAT_BASE}/{roomId}/messages`,
    READ: `${CHAT_BASE}/{roomId}/read`,
} as const

export const SKILL_ROUTES = {
    BASE: full(SKILL_BASE, SKILL_PATHS.BASE),
    BY_ID: full(SKILL_BASE, SKILL_PATHS.BY_ID),
    USER_SKILLS: full(SKILL_BASE, SKILL_PATHS.USER_SKILLS),
    // MATCH_ERRAND: full(SKILL_BASE, SKILL_PATHS.MATCH_ERRAND),
} as const

// export const PLAN_ROUTES = {
//     CREATE: full(PLAN_BASE, PLAN_PATHS.CREATE),
//     LIST: full(PLAN_BASE, PLAN_PATHS.LIST),
//     GET_ONE: full(PLAN_BASE, PLAN_PATHS.GET_ONE),
//     UPDATE: full(PLAN_BASE, PLAN_PATHS.UPDATE),
//     DELETE: full(PLAN_BASE, PLAN_PATHS.DELETE),
//     TOGGLE: full(PLAN_BASE, PLAN_PATHS.TOGGLE),
// } as const
