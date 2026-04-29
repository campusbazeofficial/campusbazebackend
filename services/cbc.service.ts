import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import {
    Wallet,
    WalletTransaction,
    WALLET_TX_TYPE,
    type WalletTxType,
} from '../models/wallet.model.js'
import { ValidationError } from '../utils/appError.js'
import { paginate, type PaginationOptions } from '../utils/paginate.js'
import { emitToUser } from '../utils/socketHelper.js'

export class CbcService extends BaseService {
    // ── Provision — called once after email verification ──────────────────────
    async provisionWallet(userId: string, welcomeBonus: number): Promise<void> {
        const uid = new mongoose.Types.ObjectId(userId)
        const existing = await Wallet.findOne({ userId: uid })
        if (existing) return // idempotent — already provisioned

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const [wallet] = await Wallet.create(
                [{ userId: uid, balance: welcomeBonus }],
                { session },
            )

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet._id,
                        type: WALLET_TX_TYPE.WELCOME_BONUS,
                        amount: welcomeBonus,
                        direction: 'credit',
                        balanceBefore: 0,
                        balanceAfter: welcomeBonus,
                        note: 'Welcome bonus on verified registration',
                    },
                ],
                { session },
            )

            await session.commitTransaction()
        } catch (err: unknown) {
            await session.abortTransaction()
            // Duplicate key = concurrent request already provisioned — treat as no-op
            if ((err as { code?: number }).code === 11000) return
            throw err
        } finally {
            session.endSession()
        }
    }

    // ── Get balance ───────────────────────────────────────────────────────────
    async getBalance(userId: string): Promise<number> {
        const wallet = await Wallet.findOne({
            userId: new mongoose.Types.ObjectId(userId),
        }).lean()
        return wallet?.balance ?? 0
    }

    async getWallet(userId: string) {
        return Wallet.findOne({
            userId: new mongoose.Types.ObjectId(userId),
        }).lean()
    }
    async credit(
        userId: string,
        amount: number,
        type: WalletTxType = WALLET_TX_TYPE.ADMIN_CREDIT,
        note?: string,
        reference?: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        if (amount <= 0)
            throw new ValidationError('Credit amount must be positive')

        // Idempotency: skip if this reference has already been processed
        if (reference) {
            const exists = await WalletTransaction.findOne({ reference }).lean()
            if (exists) return
        }

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            // { new: true, upsert: true } → returns doc AFTER $inc
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid },
                { $inc: { balance: amount } },
                { new: true, upsert: true, session },
            )

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet!._id,
                        type,
                        amount,
                        direction: 'credit',
                        balanceBefore: wallet!.balance - amount, // new balance − amount = old balance
                        balanceAfter: wallet!.balance,
                        reference,
                        note,
                        metadata,
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet!.balance,
                ngnEarnings: wallet!.ngnEarnings ?? 0,
                pendingEarnings: wallet!.pendingEarnings ?? 0,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async debit(
        userId: string,
        amount: number,
        type: WalletTxType = WALLET_TX_TYPE.DEBIT_CONTACT,
        note?: string,
        reference?: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        if (amount <= 0)
            throw new ValidationError('Debit amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            // Filter includes balance: { $gte: amount } — the update only runs if
            // the user can afford it. null result = insufficient funds.
            // { new: true } → returns doc AFTER $inc (i.e. balance already reduced)
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid, balance: { $gte: amount } },
                { $inc: { balance: -amount } },
                { new: true, session },
            )

            if (!wallet) {
                throw new ValidationError('Insufficient CBC balance')
            }

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet._id,
                        type,
                        amount,
                        direction: 'debit',
                        balanceBefore: wallet.balance + amount, // new balance + amount = old balance
                        balanceAfter: wallet.balance,
                        reference,
                        note,
                        metadata,
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet.balance,
                ngnEarnings: wallet.ngnEarnings ?? 0,
                pendingEarnings: wallet.pendingEarnings ?? 0,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async canAfford(userId: string, amount: number): Promise<boolean> {
        const balance = await this.getBalance(userId)
        return balance >= amount
    }

    async creditEarnings(
        userId: string,
        amountNGN: number,
        type: WalletTxType,
        note?: string,
        reference?: string,
    ): Promise<void> {
        if (amountNGN <= 0)
            throw new ValidationError('Earnings amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid },
                { $inc: { ngnEarnings: amountNGN } },
                { new: true, upsert: true, session },
            )

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet!._id,
                        type,
                        amount: amountNGN,
                        direction: 'credit',
                        balanceBefore: wallet!.ngnEarnings - amountNGN,
                        balanceAfter: wallet!.ngnEarnings,
                        reference,
                        note,
                        metadata: { currency: 'NGN' },
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet!.balance ?? 0,
                ngnEarnings: wallet!.ngnEarnings,
                pendingEarnings: wallet!.pendingEarnings ?? 0,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async debitEarnings(
        userId: string,
        amountNGN: number,
        type: WalletTxType,
        note?: string,
        reference?: string,
    ): Promise<void> {
        if (amountNGN <= 0) throw new ValidationError('Amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid, ngnEarnings: { $gte: amountNGN } },
                { $inc: { ngnEarnings: -amountNGN } },
                { new: true, session },
            )

            if (!wallet) {
                throw new ValidationError('Insufficient withdrawable earnings')
            }

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet._id,
                        type,
                        amount: amountNGN,
                        direction: 'debit',
                        balanceBefore: wallet.ngnEarnings + amountNGN,
                        balanceAfter: wallet.ngnEarnings,
                        reference,
                        note,
                        metadata: { currency: 'NGN' },
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet!.balance ?? 0,
                ngnEarnings: wallet!.ngnEarnings ?? 0,
                pendingEarnings: wallet!.pendingEarnings,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async holdEarnings(
        userId: string,
        amountNGN: number,
        type: WalletTxType,
        note?: string,
        reference?: string,
    ): Promise<void> {
        if (amountNGN <= 0) throw new ValidationError('Amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid },
                { $inc: { pendingEarnings: amountNGN } },
                { new: true, upsert: true, session },
            )

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet!._id,
                        type,
                        amount: amountNGN,
                        direction: 'credit',
                        balanceBefore: wallet!.pendingEarnings - amountNGN,
                        balanceAfter: wallet!.pendingEarnings,
                        reference,
                        note: note ?? 'Earnings held pending admin clearance',
                        metadata: { currency: 'NGN', held: true },
                    },
                ],
                { session },
            )

            await session.commitTransaction()
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async releaseHeldEarnings(
        userId: string,
        amountNGN: number,
        reference?: string,
    ): Promise<void> {
        if (amountNGN <= 0) throw new ValidationError('Amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid, pendingEarnings: { $gte: amountNGN } },
                {
                    $inc: {
                        pendingEarnings: -amountNGN,
                        ngnEarnings: amountNGN,
                    },
                },
                { new: true, session },
            )

            if (!wallet)
                throw new ValidationError('Insufficient pending earnings')

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet._id,
                        type: WALLET_TX_TYPE.EARNING_RELEASED, // reuse — represents cleared earnings
                        amount: amountNGN,
                        direction: 'credit',
                        balanceBefore: wallet.ngnEarnings - amountNGN,
                        balanceAfter: wallet.ngnEarnings,
                        reference,
                        note: 'Earnings cleared and released to withdrawable balance',
                        metadata: { currency: 'NGN', cleared: true },
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet.balance ?? 0,
                ngnEarnings: wallet.ngnEarnings ?? 0,
                pendingEarnings: wallet.pendingEarnings,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async reverseHeldEarnings(
        userId: string,
        amountNGN: number,
        reference?: string,
        note?: string,
    ): Promise<void> {
        if (amountNGN <= 0) throw new ValidationError('Amount must be positive')

        const uid = new mongoose.Types.ObjectId(userId)
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const wallet = await Wallet.findOneAndUpdate(
                { userId: uid, pendingEarnings: { $gte: amountNGN } },
                { $inc: { pendingEarnings: -amountNGN } },
                { new: true, session },
            )
            if (!wallet)
                throw new ValidationError(
                    'Insufficient pending earnings to reverse',
                )

            await WalletTransaction.create(
                [
                    {
                        userId: uid,
                        walletId: wallet._id,
                        type: WALLET_TX_TYPE.EARNING_REJECTED,
                        amount: amountNGN,
                        direction: 'debit',
                        balanceBefore: wallet.pendingEarnings + amountNGN,
                        balanceAfter: wallet.pendingEarnings,
                        reference,
                        note: note ?? 'Pending earnings reversed by admin',
                        metadata: { currency: 'NGN', rejected: true },
                    },
                ],
                { session },
            )

            await session.commitTransaction()
            emitToUser(userId, 'wallet:updated', {
                cbcBalance: wallet.balance,
                ngnEarnings: wallet.ngnEarnings,
                pendingEarnings: wallet.pendingEarnings,
            })
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }

    async getEarningsBalance(userId: string): Promise<number> {
        const wallet = await Wallet.findOne({
            userId: new mongoose.Types.ObjectId(userId),
        }).lean()
        return wallet?.ngnEarnings ?? 0
    }

    async creditEarningsDirectly(
        userId: string,
        amountNGN: number,
        reference?: string,
        note?: string,
    ): Promise<void> {
        // Same as creditEarnings but with EARNING_REJECTED type to distinguish
        await this.creditEarnings(
            userId,
            amountNGN,
            WALLET_TX_TYPE.ADMIN_CREDIT,
            note ?? 'Earnings credited after appeal approval',
            reference ? reference + '_reapproved' : undefined,
        )
    }

    async getLedger(userId: string, opts: PaginationOptions = {}) {
        return paginate(
            WalletTransaction,
            { userId: new mongoose.Types.ObjectId(userId) },
            { ...opts, sort: 'createdAt', order: 'desc' },
        )
    }
}
