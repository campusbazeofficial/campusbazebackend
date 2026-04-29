import mongoose, { Schema, Document } from 'mongoose'

// ─── Category → Type map (used for validation + frontend rendering) ───────────

export const SUPPORT_CATEGORIES = {
    ACCOUNT: 'account',
    PAYMENT: 'payment',
    ERRAND: 'errand',
    ORDER: 'order',
    TECHNICAL: 'technical',
    OTHER: 'other',
} as const

export const SUPPORT_TYPES: Record<string, readonly string[]> = {
    account: [
        'login_problem',
        'suspended_account',
        'verification_issue',
        'delete_request',
        'profile_issue',
    ],
    payment: [
        'payment_failed',
        'withdrawal_issue',
        'wrong_charge',
        'refund_request',
        'cbc_balance_issue',
    ],
    errand: [
        'runner_no_show',
        'errand_not_completed',
        'unfair_cancellation',
        'errand_dispute_issue',
    ],
    order: [
        'order_not_delivered',
        'quality_issue',
        'seller_unresponsive',
        'order_refund_request',
    ],
    technical: [
        'app_crash',
        'bug_report',
        'feature_not_working',
        'slow_performance',
    ],
    other: ['general_inquiry', 'feedback', 'partnership', 'other'],
} as const

// ─── Labels for frontend display ──────────────────────────────────────────────

export const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
    account: 'Account & Profile',
    payment: 'Payments & Wallet',
    errand: 'Errands',
    order: 'Service Orders',
    technical: 'Technical Issues',
    other: 'Other',
}

export const SUPPORT_TYPE_LABELS: Record<string, string> = {
    login_problem: 'I cannot log in',
    suspended_account: 'My account was suspended',
    verification_issue: 'Verification problem',
    delete_request: 'I want to delete my account',
    profile_issue: 'Profile update issue',
    payment_failed: 'My payment failed',
    withdrawal_issue: 'Withdrawal problem',
    wrong_charge: 'I was charged incorrectly',
    refund_request: 'I need a refund',
    cbc_balance_issue: 'CBC coin balance issue',
    runner_no_show: 'Runner did not show up',
    errand_not_completed: 'Errand was not completed',
    unfair_cancellation: 'Unfair cancellation',
    errand_dispute_issue: 'Issue with dispute outcome',
    order_not_delivered: 'Order was not delivered',
    quality_issue: 'Delivery quality issue',
    seller_unresponsive: 'Seller is not responding',
    order_refund_request: 'I need an order refund',
    app_crash: 'App keeps crashing',
    bug_report: 'I found a bug',
    feature_not_working: 'A feature is not working',
    slow_performance: 'App is very slow',
    general_inquiry: 'General question',
    feedback: 'I have feedback',
    partnership: 'Partnership inquiry',
    other: 'Something else',
}

// ─── Description templates shown to user in step 3 ───────────────────────────

export const SUPPORT_DESCRIPTION_TEMPLATES: Record<string, string> = {
    login_problem:
        'Please describe what happens when you try to log in. Include any error messages you see.',
    suspended_account:
        'Please explain the situation. When did your account get suspended? Have you received any notification?',
    verification_issue:
        'Which document did you submit? What issue are you experiencing with verification?',
    delete_request:
        'Please confirm you understand this action is permanent and describe any final concerns.',
    profile_issue:
        'What profile field are you trying to update and what error or issue are you experiencing?',
    payment_failed:
        'Please provide the payment reference or amount and when the payment was attempted.',
    withdrawal_issue:
        'Please provide your withdrawal amount, bank details (no full account number), and the date of the request.',
    wrong_charge:
        'Please describe what you were charged, the amount, and what you expected to be charged.',
    refund_request:
        'Please provide the transaction reference or order/errand ID and reason for the refund request.',
    cbc_balance_issue:
        'Describe the discrepancy. What is your current balance and what did you expect it to be?',
    runner_no_show:
        'Please provide the errand ID and describe what happened. When was the errand accepted?',
    errand_not_completed:
        'Please provide the errand ID. Describe what was agreed and what was actually delivered.',
    unfair_cancellation:
        'Please provide the errand ID and explain why you believe the cancellation was unfair.',
    errand_dispute_issue:
        'Please provide the errand ID and the dispute outcome you received. What outcome did you expect and why?',
    order_not_delivered:
        'Please provide the order ID and delivery due date. How many days overdue is the delivery?',
    quality_issue:
        'Please provide the order ID and describe specifically what was wrong with the delivery.',
    seller_unresponsive:
        'Please provide the order ID and when you last received a response from the seller.',
    order_refund_request:
        'Please provide the order ID and the reason you are requesting a refund.',
    app_crash:
        'Describe what you were doing when the crash occurred. What device and OS version are you using?',
    bug_report:
        'Please describe the bug in detail. What did you expect to happen and what actually happened?',
    feature_not_working:
        'Which feature is not working? Please describe the steps to reproduce the issue.',
    slow_performance:
        'Which part of the app is slow? Does it happen every time or occasionally?',
    general_inquiry: 'Please describe your question or inquiry in detail.',
    feedback: 'We value your feedback! Please share your thoughts in detail.',
    partnership:
        'Please describe your company and the type of partnership you are interested in.',
    other: 'Please describe your issue or request in as much detail as possible.',
}

// ─── Ticket status & priority ─────────────────────────────────────────────────

export const TICKET_STATUS = {
    OPEN: 'open',
    IN_REVIEW: 'in_review',
    RESOLVED: 'resolved',
    CLOSED: 'closed',
} as const

export const TICKET_PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent',
} as const

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ISupportTicket extends Document {
    userId: mongoose.Types.ObjectId
    ticketNumber: string
    category: string
    type: string
    description: string
    status: string
    priority: string
    adminNote?: string
    resolvedBy?: mongoose.Types.ObjectId
    resolvedAt?: Date
    relatedId?: string // optional errand/order ID user can attach
    createdAt: Date
    updatedAt: Date
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const supportTicketSchema = new Schema<ISupportTicket>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        ticketNumber: {
            type: String,
            unique: true,
            index: true,
        },
        category: {
            type: String,
            enum: Object.values(SUPPORT_CATEGORIES),
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
            minlength: 20,
            maxlength: 2000,
        },
        status: {
            type: String,
            enum: Object.values(TICKET_STATUS),
            default: TICKET_STATUS.OPEN,
            index: true,
        },
        priority: {
            type: String,
            enum: Object.values(TICKET_PRIORITY),
            default: TICKET_PRIORITY.MEDIUM,
        },
        adminNote: { type: String, maxlength: 1000 },
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        resolvedAt: { type: Date },
        relatedId: { type: String }, // errand/order ID
    },
    { timestamps: true },
)

// ─── Auto-generate ticket number ──────────────────────────────────────────────

// support.model.ts — replace the pre-save hook

supportTicketSchema.pre('save', async function (next) {
    if (this.isNew) {
        const count = await mongoose.model('SupportTicket').countDocuments()
        this.ticketNumber = `TKT-${String(count + 1).padStart(5, '0')}`
        next()
        return
    }
    next()
})

export default mongoose.model<ISupportTicket>(
    'SupportTicket',
    supportTicketSchema,
)
