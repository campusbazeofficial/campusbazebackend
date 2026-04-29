import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Withdrawal, { WITHDRAWAL_STATUS } from '../models/withdraw.model.js'
import { CbcService } from './cbc.service.js'
import { NotificationService } from './notification.service.js'
import {
    createTransferRecipient,
    initiateTransfer,
    generateReference,
} from '../utils/paystack.js'
import {
    ValidationError,
    NotFoundError,
    ConflictError,
    ForbiddenError,
} from '../utils/appError.js'
import Wallet, { WALLET_TX_TYPE } from '../models/wallet.model.js'
import {
    ERRAND_STATUS,
    MIN_WITHDRAWAL_NGN,
    NOTIFICATION_TYPE,
    ORDER_STATUS,
} from '../utils/constant.js'
import Errand from '../models/errand.model.js'
import Order from '../models/order.model.js'
import dayjs from 'dayjs'
import User from '../models/user.model.js'
import { emitToUser } from '../utils/socketHelper.js'

const cbcService = new CbcService()
const notificationService = new NotificationService()

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum withdrawal: ₦500

// ─── Service ──────────────────────────────────────────────────────────────────

export class WithdrawalService extends BaseService {
    //  async initializeWithdrawal(
    //         userId: string,
    //         amountNGN: number,
    //         bankCode: string,
    //         accountNumber: string,
    //         accountName: string,
    //         bankName: string,
    //     ) {
    //         if (amountNGN < MIN_WITHDRAWAL_NGN) {
    //             throw new ValidationError(
    //                 `Minimum withdrawal is ₦${MIN_WITHDRAWAL_NGN.toLocaleString()}`,
    //             )
    //         }

    //         // Block concurrent pending withdrawals
    //         const pendingExists = await Withdrawal.exists({
    //             userId: new mongoose.Types.ObjectId(userId),
    //             status: {
    //                 $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING],
    //             },
    //         })
    //         if (pendingExists) {
    //             throw new ConflictError(
    //                 'You already have a withdrawal in progress. Wait for it to complete before initiating another.',
    //             )
    //         }

    //         // Check withdrawable earnings balance — NOT CBC balance
    //         const earningsBalance = await cbcService.getEarningsBalance(userId)
    //         if (earningsBalance < amountNGN) {
    //             throw new ValidationError(
    //                 `Insufficient withdrawable earnings. Available: ₦${earningsBalance.toLocaleString()}`,
    //             )
    //         }

    //         const reference = generateReference('WDR')

    //         // Create Paystack transfer recipient
    //         const recipient = await createTransferRecipient(
    //             bankCode,
    //             accountNumber,
    //             accountName,
    //         )

    //         // Debit from ngnEarnings immediately — held until transfer completes or refunds
    //         await cbcService.debitEarnings(
    //             userId,
    //             amountNGN,
    //             WALLET_TX_TYPE.WITHDRAWAL,
    //             `Withdrawal of ₦${amountNGN.toLocaleString()} to ${bankName} ${accountNumber}`,
    //             reference,
    //         )

    //         // Initiate Paystack transfer
    //         const transfer = await initiateTransfer(
    //             amountNGN,
    //             recipient.recipientCode,
    //             reference,
    //             'CampusBaze earnings withdrawal',
    //         )

    //         const withdrawal = await Withdrawal.create({
    //             userId: new mongoose.Types.ObjectId(userId),
    //             bankCode,
    //             bankName,
    //             accountNumber,
    //             accountName,
    //             amountNGN,
    //             recipientCode: recipient.recipientCode,
    //             transferCode: transfer.transferCode,
    //             reference,
    //             status: WITHDRAWAL_STATUS.PROCESSING,
    //             initiatedAt: new Date(),
    //         })

    //         notificationService
    //             .create({
    //                 userId,
    //                 type: NOTIFICATION_TYPE.PAYMENT,
    //                 title: 'Withdrawal initiated 💸',
    //                 body: `Your withdrawal of ₦${amountNGN.toLocaleString()} to ${bankName} is being processed.`,
    //                 data: { amountNGN, reference },
    //             })
    //             .catch(() => null)

    //         return {
    //             withdrawalId: withdrawal._id,
    //             reference,
    //             amountNGN,
    //             status: withdrawal.status,
    //             bankName,
    //             accountNumber,
    //         }
    //     }

    // ── Handle transfer.success webhook ───────────────────────────────────────
    async handleTransferSuccess(reference: string): Promise<void> {
        const withdrawal = await Withdrawal.findOne({ reference })
        if (!withdrawal) return // not our transfer
        if (withdrawal.status === WITHDRAWAL_STATUS.PAID) return // idempotent

        withdrawal.status = WITHDRAWAL_STATUS.PAID
        withdrawal.completedAt = new Date()
        await withdrawal.save()
        emitToUser(withdrawal.userId.toString(), 'withdrawal:updated', {
            id: withdrawal._id.toString(),
            status: WITHDRAWAL_STATUS.PAID,
            completedAt: withdrawal.completedAt,
        })
        notificationService
            .create({
                userId: withdrawal.userId.toString(),
                type: NOTIFICATION_TYPE.PAYMENT,
                title: 'Withdrawal successful',
                body: `₦${withdrawal.amountNGN.toLocaleString()} has been sent to your ${withdrawal.bankName} account.`,
                data: { amountNGN: withdrawal.amountNGN, reference },
            })
            .catch(() => null)
    }

    // ── Handle transfer.failed webhook ────────────────────────────────────────
    async handleTransferFailed(
        reference: string,
        reason?: string,
    ): Promise<void> {
        const withdrawal = await Withdrawal.findOne({ reference })
        if (!withdrawal) return
        if (withdrawal.status === WITHDRAWAL_STATUS.FAILED) return // idempotent

        withdrawal.status = WITHDRAWAL_STATUS.FAILED
        withdrawal.failureReason = reason ?? 'Transfer failed'
        withdrawal.completedAt = new Date()
        await withdrawal.save()

        // Refund NGN earnings back to wallet
        await cbcService.creditEarnings(
            withdrawal.userId.toString(),
            withdrawal.amountNGN,
            WALLET_TX_TYPE.WITHDRAWAL_REFUND,
            `Refund for failed withdrawal (ref: ${reference})`,
            `${reference}_refund`,
        )
        emitToUser(withdrawal.userId.toString(), 'withdrawal:updated', {
            id: withdrawal._id.toString(),
            status: WITHDRAWAL_STATUS.FAILED,
            failureReason: withdrawal.failureReason,
            completedAt: withdrawal.completedAt,
        })

        notificationService
            .create({
                userId: withdrawal.userId.toString(),
                type: NOTIFICATION_TYPE.PAYMENT,
                title: 'Withdrawal failed',
                body: `Your withdrawal of ₦${withdrawal.amountNGN.toLocaleString()} failed. The amount has been returned to your earnings balance.`,
                data: { amountNGN: withdrawal.amountNGN, reference, reason },
            })
            .catch(() => null)
    }

    // ── Get withdrawal history ─────────────────────────────────────────────────
    async getWithdrawals(userId: string) {
        return Withdrawal.find({ userId: new mongoose.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .select('-recipientCode -transferCode') // don't expose Paystack internals
            .lean()
    }

    // ── Check if user has any active disputes ─────────────────────────────────────
    private async _hasActiveDisputes(userId: string): Promise<boolean> {
        const uid = new mongoose.Types.ObjectId(userId)
        const [errandDispute, orderDispute] = await Promise.all([
            Errand.exists({
                status: ERRAND_STATUS.DISPUTED,
                $or: [{ posterId: uid }, { runnerId: uid }],
            }),
            Order.exists({
                status: ORDER_STATUS.DISPUTED,
                $or: [{ buyerId: uid }, { sellerId: uid }],
            }),
        ])
        return !!(errandDispute || orderDispute)
    }

    // ── Request withdrawal — adds 24hr hold before transfer fires ─────────────────
    async requestWithdrawal(
        userId: string,
        amountNGN: number,
        bankCode: string,
        bankName: string,
        accountNumber: string,
        accountName: string,
    ) {
        // ── Dispute block ─────────────────────────────────────────────────────────
        const hasDisputes = await this._hasActiveDisputes(userId)
        if (hasDisputes) {
            throw new ForbiddenError(
                'You cannot withdraw while you have an active dispute. Resolve it first.',
            )
        }

        // ── Balance check ─────────────────────────────────────────────────────────
        const wallet = await Wallet.findOne({
            userId: new mongoose.Types.ObjectId(userId),
        })
        if (!wallet || wallet.ngnEarnings < amountNGN) {
            throw new ValidationError('Insufficient withdrawable balance')
        }
        if (amountNGN < MIN_WITHDRAWAL_NGN) {
            throw new ValidationError(
                `Minimum withdrawal is ${MIN_WITHDRAWAL_NGN}`,
            )
        }

        // ── Create Paystack recipient ─────────────────────────────────────────────
        const recipient = await createTransferRecipient(
            bankCode,
            accountNumber,
            accountName,
        )

        const reference = generateReference('WDR')
        // ── Determine hold period based on user trust level ──────────────────────────
        const user = await User.findById(userId)
            .select('identityVerificationBadge subscriptionTier')
            .lean()

        const isTrusted =
            user?.identityVerificationBadge === true &&
            user?.subscriptionTier !== 'free'

        const holdHours = isTrusted ? 6 : 24
        const releaseAt = dayjs().add(holdHours, 'hour').toDate()

        // ── Debit earnings immediately — held in withdrawal record ────────────────
        await cbcService.debitEarnings(
            userId,
            amountNGN,
            WALLET_TX_TYPE.WITHDRAWAL,
            `Withdrawal requested — ${holdHours}hr hold in progress`,
            reference,
        )

        const withdrawal = await Withdrawal.create({
            userId: new mongoose.Types.ObjectId(userId),
            bankCode,
            bankName,
            accountNumber,
            accountName,
            amountNGN,
            recipientCode: recipient.recipientCode,
            reference,
            status: WITHDRAWAL_STATUS.PENDING,
            releaseAt,
            requestedAt: new Date(),
        })

        emitToUser(userId, 'withdrawal:updated', {
            id: withdrawal._id.toString(),
            status: WITHDRAWAL_STATUS.PENDING,
            amountNGN: withdrawal.amountNGN,
            bankName: withdrawal.bankName,
            releaseAt: withdrawal.releaseAt,
            requestedAt: withdrawal.requestedAt,
        })
        await notificationService.create({
            userId,
            type: NOTIFICATION_TYPE.PAYMENT,
            title: 'Withdrawal requested',
            body: `Your withdrawal of ₦${amountNGN.toLocaleString()} will be processed in ${holdHours} hours.`,
            data: { reference, releaseAt, amountNGN, holdHours },
        })

        return withdrawal
    }

    async processWithdrawal(withdrawalId: string): Promise<void> {
        const withdrawal = await Withdrawal.findOneAndUpdate(
            { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
            { status: WITHDRAWAL_STATUS.PROCESSING },
            { new: true },
        )
        if (!withdrawal) return // already processing or cancelled

        try {
            const transfer = await initiateTransfer(
                withdrawal.amountNGN,
                withdrawal.recipientCode,
                withdrawal.reference,
                'CampusBaze earnings withdrawal',
            )

            await Withdrawal.findByIdAndUpdate(withdrawalId, {
                transferCode: transfer.transferCode,
            })
        } catch (err) {
            // Revert to pending so cron retries, refund user
            await Withdrawal.findByIdAndUpdate(withdrawalId, {
                status: WITHDRAWAL_STATUS.FAILED,
                failureReason:
                    err instanceof Error
                        ? err.message
                        : 'Transfer initiation failed',
            })
            await cbcService.creditEarnings(
                withdrawal.userId.toString(),
                withdrawal.amountNGN,
                WALLET_TX_TYPE.WITHDRAWAL_REFUND,
                'Withdrawal failed during processing',
                withdrawal.reference,
            )

            emitToUser(withdrawal.userId.toString(), 'withdrawal:updated', {
                id: withdrawal._id.toString(),
                status: WITHDRAWAL_STATUS.FAILED,
            })
            throw err
        }
    }

    // ── Cancel withdrawal during hold period ──────────────────────────────────────
    async cancelWithdrawal(withdrawalId: string, userId: string) {
        const withdrawal = await Withdrawal.findOne({
            _id: new mongoose.Types.ObjectId(withdrawalId),
            userId: new mongoose.Types.ObjectId(userId),
            status: WITHDRAWAL_STATUS.PENDING,
        })
        if (!withdrawal) {
            throw new NotFoundError('Pending withdrawal not found')
        }
        if (dayjs().isAfter(withdrawal.releaseAt)) {
            throw new ConflictError(
                'Withdrawal is already being processed and cannot be cancelled',
            )
        }

        withdrawal.status = WITHDRAWAL_STATUS.CANCELLED
        await withdrawal.save()

        // Refund earnings back to wallet
        await cbcService.creditEarnings(
            userId,
            withdrawal.amountNGN,
            WALLET_TX_TYPE.WITHDRAWAL_REFUND,
            'Withdrawal cancelled during hold period',
            withdrawal.reference + '_cancelled',
        )

        emitToUser(userId, 'withdrawal:updated', {
            id: withdrawal._id.toString(),
            status: WITHDRAWAL_STATUS.CANCELLED,
        })
        return withdrawal
    }
}
