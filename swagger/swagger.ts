import swaggerUi from 'swagger-ui-express'
import type { Express } from 'express'
import { allPaths } from './swagger.paths.js'

const definition = {
    openapi: '3.0.0',
    info: {
        title: 'CampusBaze API',
        version: '2.0.0',
        description:
            'CampusBaze — Student & Professional Marketplace. Web Edition.',
        contact: {
            name: 'WembleyTech and Research Hub',
            email: 'dev@campusbaze.com',
        },
    },
    servers: [
        { url: 'http://localhost:4000', description: 'Local development' },
        { url: 'https://api.campusbaze.com', description: 'Production' },
    ],
    security: [{ BearerAuth: [] }],
    tags: [
        { name: 'Auth', description: 'Registration, login, OTP, password' },
        { name: 'Users', description: 'Profile management and discovery' },
        { name: 'Wallet', description: 'CBC balance, ledger, and top-up' },
        {
            name: 'Verifications',
            description: 'Identity document submission and review',
        },
        { name: 'Errands', description: 'Post, bid on, and complete errands' },
        {
            name: 'Services',
            description: 'Create listings, place and manage orders',
        },
        { name: 'Notifications', description: 'In-app notification centre' },
        {
            name: 'Subscriptions',
            description: 'Subscription plans and billing',
        },
        {
            name: 'Chat',
            description: 'In-app messaging between order/errand participants',
        },
        {
            name: 'Reviews',
            description: 'Ratings and reviews for completed transactions',
        },
        { name: 'Admin', description: 'Admin-only operations' },
        { name: 'Webhooks', description: 'Paystack payment callbacks' },
    ],
    paths: allPaths,
    components: {
        securitySchemes: {
            BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
            // ── Shared ───────────────────────────────────────────────────────────────
            SuccessResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                },
            },
            ErrorResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    data: {
                        type: 'object',
                        properties: {
                            message: { type: 'string' },
                            errors: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        field: { type: 'string' },
                                        message: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            PaginationMeta: {
                type: 'object',
                properties: {
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    totalPages: { type: 'integer' },
                    hasNextPage: { type: 'boolean' },
                    hasPrevPage: { type: 'boolean' },
                },
            },
            TokenPair: {
                type: 'object',
                properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                },
            },
            AuthResult: {
                type: 'object',
                properties: {
                    user: { type: 'object' },
                    tokens: { $ref: '#/components/schemas/TokenPair' },
                },
            },

            // ── Auth requests ─────────────────────────────────────────────────────────
            RegisterIndividualRequest: {
                type: 'object',
                required: ['firstName', 'lastName', 'email', 'password'],
                properties: {
                    firstName: { type: 'string', example: 'Amara' },
                    lastName: { type: 'string', example: 'Okafor' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    phone: { type: 'string', example: '+2348012345678' },
                    isStudent: { type: 'boolean' },
                    institutionName: {
                        type: 'string',
                        example: 'University of Lagos',
                    },
                    referralCode: { type: 'string' },
                },
            },
            RegisterCorporateRequest: {
                type: 'object',
                required: [
                    'firstName',
                    'lastName',
                    'email',
                    'password',
                    'companyName',
                    'companyEmail',
                ],
                properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    phone: { type: 'string' },
                    companyName: { type: 'string', example: 'TechNova Ltd' },
                    companyEmail: { type: 'string', format: 'email' },
                    companyPhone: { type: 'string' },
                    rcNumber: { type: 'string', example: 'RC1234567' },
                    industry: { type: 'string' },
                    website: { type: 'string', format: 'uri' },
                    country: { type: 'string', default: 'Nigeria' },
                    state: { type: 'string' },
                    referralCode: { type: 'string' },
                },
            },
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                },
            },
            VerifyEmailRequest: {
                type: 'object',
                required: ['email', 'otp'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    otp: {
                        type: 'string',
                        minLength: 6,
                        maxLength: 6,
                        example: '482910',
                    },
                },
            },
            EmailOnlyRequest: {
                type: 'object',
                required: ['email'],
                properties: {
                    email: { type: 'string', format: 'email' },
                },
            },
            RefreshRequest: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                    refreshToken: { type: 'string' },
                },
            },
            ForgotPasswordRequest: {
                type: 'object',
                required: ['email'],
                properties: {
                    email: { type: 'string', format: 'email' },
                },
            },
            ResetPasswordRequest: {
                type: 'object',
                required: ['token', 'newPassword'],
                properties: {
                    token: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8 },
                },
            },
            ChangePasswordRequest: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8 },
                },
            },

            // ── User requests ─────────────────────────────────────────────────────────
            UpdateIndividualProfileRequest: {
                type: 'object',
                description:
                    'Individual accounts (student / alumni / professional). institutionName and yearOfStudy are silently ignored for the professional role.',
                properties: {
                    firstName: { type: 'string', maxLength: 50 },
                    lastName: { type: 'string', maxLength: 50 },
                    displayName: { type: 'string', maxLength: 60 },
                    bio: { type: 'string', maxLength: 500 },
                    phone: { type: 'string' },
                    institutionName: { type: 'string', maxLength: 150 },
                    yearOfStudy: { type: 'integer', minimum: 1, maximum: 10 },
                },
            },
            UpdateCorporateProfileRequest: {
                type: 'object',
                description:
                    'Single-form update for corporate accounts — director personal fields + company fields in one request.',
                properties: {
                    firstName: { type: 'string', maxLength: 50 },
                    lastName: { type: 'string', maxLength: 50 },
                    displayName: { type: 'string', maxLength: 60 },
                    bio: { type: 'string', maxLength: 500 },
                    phone: { type: 'string' },
                    companyName: { type: 'string', maxLength: 100 },
                    companyPhone: { type: 'string' },
                    description: { type: 'string', maxLength: 1000 },
                    website: { type: 'string', format: 'uri' },
                    industry: { type: 'string' },
                    address: { type: 'string' },
                    state: { type: 'string' },
                },
            },
            // Alias kept for backward compatibility
            UpdateProfileRequest: {
                $ref: '#/components/schemas/UpdateIndividualProfileRequest',
            },

            // ── Wallet ────────────────────────────────────────────────────────────────
            WalletBalance: {
                type: 'object',
                properties: {
                    balance: { type: 'number', example: 100 },
                    currency: { type: 'string', example: 'CBC' },
                },
            },
            InitPurchaseRequest: {
                type: 'object',
                required: ['cbcAmount'],
                properties: {
                    cbcAmount: { type: 'integer', minimum: 10, example: 100 },
                    callbackUrl: { type: 'string', format: 'uri' },
                },
            },

            // ── Errands ───────────────────────────────────────────────────────────────
            PostErrandRequest: {
                type: 'object',
                required: [
                    'title',
                    'description',
                    'category',
                    'budgetType',
                    'budget',
                    'address',
                    'deadline',
                ],
                properties: {
                    title: {
                        type: 'string',
                        minLength: 3,
                        maxLength: 120,
                        example: 'Deliver parcel from Yaba to Lekki',
                    },
                    description: {
                        type: 'string',
                        minLength: 10,
                        maxLength: 2000,
                    },
                    category: {
                        type: 'string',
                        enum: [
                            'delivery_pickup',
                            'grocery_shopping',
                            'printing_binding',
                            'food_runs',
                            'cleaning_laundry',
                            'moving_assistance',
                            'typing_form_filling',
                            'queue_standing',
                            'pet_care',
                            'other',
                        ],
                    },
                    budgetType: {
                        type: 'string',
                        enum: ['fixed', 'negotiable'],
                    },
                    budget: { type: 'number', minimum: 0, example: 3000 },
                    address: {
                        type: 'string',
                        maxLength: 300,
                        example: '14 Bode Thomas Street, Surulere, Lagos',
                    },
                    deadline: {
                        type: 'string',
                        format: 'date-time',
                        example: '2025-12-31T18:00:00.000Z',
                    },
                },
            },
            PlaceBidRequest: {
                type: 'object',
                required: ['amount'],
                properties: {
                    amount: { type: 'number', minimum: 0, example: 2500 },
                    message: {
                        type: 'string',
                        maxLength: 500,
                        example: 'I can deliver within 2 hours.',
                    },
                },
            },

            // ── Services / Listings ───────────────────────────────────────────────────
            ServiceTier: {
                type: 'object',
                required: ['name', 'price', 'deliveryDays', 'description'],
                properties: {
                    name: {
                        type: 'string',
                        enum: ['starter', 'standard', 'premium'],
                    },
                    price: { type: 'number', minimum: 0, example: 15000 },
                    deliveryDays: { type: 'integer', minimum: 1, example: 3 },
                    description: { type: 'string', maxLength: 500 },
                    revisions: { type: 'integer', minimum: 0, default: 1 },
                },
            },
            CreateListingRequest: {
                type: 'object',
                required: ['title', 'description', 'category', 'tiers'],
                properties: {
                    title: { type: 'string', minLength: 3, maxLength: 120 },
                    description: {
                        type: 'string',
                        minLength: 20,
                        maxLength: 3000,
                    },
                    category: {
                        type: 'string',
                        enum: [
                            'graphic_design',
                            'content_writing',
                            'programming',
                            'web_dev',
                            'tutoring',
                            'video_production',
                            'digital_marketing',
                            'music_audio',
                            'legal',
                            'engineering',
                            'translation',
                            'consulting',
                            'data_analytics',
                            'other',
                        ],
                    },
                    tiers: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ServiceTier' },
                        minItems: 1,
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string', maxLength: 30 },
                        maxItems: 10,
                    },
                    portfolioUrls: {
                        type: 'array',
                        items: { type: 'string', format: 'uri' },
                        maxItems: 10,
                    },
                },
            },
            UpdateListingRequest: {
                type: 'object',
                description:
                    'All fields optional. status can be used to activate (active), pause (paused), or draft a listing.',
                properties: {
                    title: { type: 'string', maxLength: 120 },
                    description: { type: 'string', maxLength: 3000 },
                    category: { type: 'string' },
                    tiers: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ServiceTier' },
                    },
                    tags: { type: 'array', items: { type: 'string' } },
                    portfolioUrls: {
                        type: 'array',
                        items: { type: 'string', format: 'uri' },
                    },
                    status: {
                        type: 'string',
                        enum: ['active', 'paused', 'draft'],
                    },
                },
            },
            PlaceOrderRequest: {
                type: 'object',
                required: ['tierName'],
                properties: {
                    tierName: {
                        type: 'string',
                        enum: ['starter', 'standard', 'premium'],
                    },
                    requirements: {
                        type: 'string',
                        maxLength: 2000,
                        description:
                            'Instructions or files description for the seller',
                    },
                    callbackUrl: {
                        type: 'string',
                        format: 'uri',
                        description: 'Paystack redirect URL after payment',
                    },
                },
            },

            // ── Admin ─────────────────────────────────────────────────────────────────
            ReviewVerificationRequest: {
                type: 'object',
                required: ['status'],
                description:
                    "adminNote is required when status is 'rejected' so the user knows how to resubmit.",
                properties: {
                    status: { type: 'string', enum: ['verified', 'rejected'] },
                    adminNote: { type: 'string', maxLength: 500 },
                },
            },
        },
    },
}

export const swaggerSpec = definition

export const setupSwagger = (app: Express): void => {
    app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec as never, {
            customSiteTitle: 'CampusBaze API Docs',
            swaggerOptions: { persistAuthorization: true },
        }),
    )
    app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec))
    console.log('📚 Swagger docs → /api-docs')
}
