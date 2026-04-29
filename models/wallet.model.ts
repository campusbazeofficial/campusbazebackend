import mongoose, { Schema, Document, Model } from 'mongoose'

// ─── Transaction types ────────────────────────────────────────────────────────

// export const WALLET_TX_TYPE = {
//     WELCOME_BONUS: 'welcome_bonus',
//     REFERRAL_REWARD: 'referral_reward',
//     PURCHASE: 'purchase', // fiat → CBC top-up
//     DEBIT_CONTACT: 'debit_contact', // CBC spent to contact a seller/poster
//     DEBIT_BOOST: 'debit_boost', // CBC spent on visibility boost
//     DEBIT_ERRAND_POST: 'debit_errand_post', // CBC spent to post an errand
//     ADMIN_CREDIT: 'admin_credit', // admin manually credits CBC
//     ADMIN_DEBIT: 'admin_debit', // admin manually debits CBC
//     ERRAND_EARNINGS: 'errand_earnings', // runner earns CBC from confirmed errand
//     ORDER_EARNINGS: 'order_earnings', // seller earns CBC from completed order
//     WITHDRAWAL: 'withdrawal', // NGN payout initiated
//     WITHDRAWAL_REFUND: 'withdrawal_refund', // failed transfer — balance restored
//     EARNING_RELEASED: 'earning_released',
//     EARNING_REJECTED: 'earning_rejected',
// } as const

export const WALLET_TX_TYPE = {
    // ── CBC ───────────────────────────────────────────────────────────────
    WELCOME_BONUS: 'welcome_bonus',
    REFERRAL_REWARD: 'referral_reward',
    PURCHASE: 'purchase',
    DEBIT_CONTACT: 'debit_contact',
    DEBIT_BOOST: 'debit_boost',
    DEBIT_ERRAND_POST: 'debit_errand_post',
    ADMIN_CREDIT: 'admin_credit',
    ADMIN_DEBIT: 'admin_debit',
 CBC_MONTHLY_ALLOCATION: 'cbc_monthly_allocation',
    // ── NGN Earnings lifecycle ────────────────────────────────────────────
    EARNING_HELD: 'earning_held',
    EARNING_RELEASED: 'earning_released',
    EARNING_REJECTED: 'earning_rejected',

    // ── NGN Withdrawals ───────────────────────────────────────────────────
    WITHDRAWAL: 'withdrawal',
    WITHDRAWAL_REFUND: 'withdrawal_refund',
} as const
export type WalletTxType = (typeof WALLET_TX_TYPE)[keyof typeof WALLET_TX_TYPE]

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface IWallet extends Document {
    _id: mongoose.Types.ObjectId
    userId: mongoose.Types.ObjectId
    balance: number // CBC coins — welcome bonus, purchased, gifted (NOT withdrawable)
    ngnEarnings: number // NGN — from confirmed errands + completed orders (withdrawable)
    currency: 'CBC'
    pendingEarnings: number
    createdAt: Date
    updatedAt: Date
}

const walletSchema = new Schema<IWallet>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        balance: { type: Number, default: 0, min: 0 }, // CBC — not withdrawable
        ngnEarnings: { type: Number, default: 0, min: 0 }, // NGN — withdrawable earnings
        currency: { type: String, default: 'CBC', enum: ['CBC'] },
        pendingEarnings: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
)

export const Wallet = mongoose.model<IWallet>('Wallet', walletSchema)

// ─── Wallet Transaction (immutable ledger) ────────────────────────────────────

export interface IWalletTransaction extends Document {
    _id: mongoose.Types.ObjectId
    userId: mongoose.Types.ObjectId
    walletId: mongoose.Types.ObjectId
    type: WalletTxType
    amount: number // always positive; sign inferred from type
    direction: 'credit' | 'debit'
    balanceBefore: number
    balanceAfter: number
    reference?: string // payment ref, errand id, etc.
    note?: string // human-readable reason
    metadata?: Record<string, unknown>
    createdAt: Date
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        walletId: {
            type: Schema.Types.ObjectId,
            ref: 'Wallet',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(WALLET_TX_TYPE),
            required: true,
        },
        amount: { type: Number, required: true, min: 0 },
        direction: { type: String, enum: ['credit', 'debit'], required: true },
        balanceBefore: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        reference: { type: String },
        note: { type: String, maxlength: 200 },
        metadata: { type: Schema.Types.Mixed },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    },
)

walletTransactionSchema.index({ userId: 1, createdAt: -1 })
walletTransactionSchema.index({ reference: 1 }, { sparse: true })

// Prevent updates — ledger rows must never be modified after creation
walletTransactionSchema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'],
    function () {
        throw new Error('Wallet transactions are immutable')
    },
)

export const WalletTransaction = mongoose.model<IWalletTransaction>(
    'WalletTransaction',
    walletTransactionSchema,
)

export default Wallet
