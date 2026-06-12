import cron from 'node-cron'
import dayjs from 'dayjs'
import Withdrawal, { WITHDRAWAL_STATUS } from '../models/withdraw.model.js'
import { WithdrawalService } from '../services/withdraw.service.js'

const withdrawalService = new WithdrawalService()

async function processMaturedWithdrawals(): Promise<void> {
    const now = new Date()

    const due = await Withdrawal.find({
        status: WITHDRAWAL_STATUS.PENDING,
        releaseAt: { $lte: now },
    })
        .select('_id userId reference amountNGN releaseAt status bankCode recipientCode')
        .lean()

    console.log(`[WithdrawalCron] Checked at ${now.toISOString()} — found ${due.length} due`)

    // Log all pending regardless of releaseAt to see if they exist at all
    const allPending = await Withdrawal.countDocuments({ status: WITHDRAWAL_STATUS.PENDING })
    console.log(`[WithdrawalCron] Total PENDING withdrawals in DB: ${allPending}`)

    if (due.length === 0) return

    for (const w of due) {
        console.log(`[WithdrawalCron] Processing ${w._id} — releaseAt: ${w.releaseAt}, recipientCode: ${(w as any).recipientCode}`)
        try {
            await withdrawalService.processWithdrawal(w._id.toString())
        } catch (err) {
            console.error(`[WithdrawalCron] ❌ Failed ${w._id}:`, err instanceof Error ? err.message : err)
        }
    }
}

export const startWithdrawalCron = (): void => {
    // Check every 30 minutes in production, every minute in dev
    const schedule = process.env.NODE_ENV === 'production' ? '*/30 * * * *' : '* * * * *'

    cron.schedule(schedule, async () => {
        try {
            await processMaturedWithdrawals()
        } catch (err) {
            console.error('[WithdrawalCron] Unhandled error:', err)
        }
    })

    console.log(`🏧 Withdrawal release cron started — schedule: "${schedule}"`)
}