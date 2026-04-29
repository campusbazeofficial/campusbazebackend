import cron from 'node-cron'
import dayjs from 'dayjs'
import Withdrawal, { WITHDRAWAL_STATUS } from '../models/withdraw.model.js'
import { WithdrawalService } from '../services/withdraw.service.js'

const withdrawalService = new WithdrawalService()

async function processMaturedWithdrawals(): Promise<void> {
    const now = new Date()

    const due = await Withdrawal.find({
        status:    WITHDRAWAL_STATUS.PENDING,
        releaseAt: { $lte: now },
    })
        .select('_id userId reference amountNGN')
        .lean()

    if (due.length === 0) return

    console.log(`[WithdrawalCron] ${due.length} withdrawal(s) ready to process`)

    for (const w of due) {
        try {
            await withdrawalService.processWithdrawal(w._id.toString())
            console.log(`[WithdrawalCron] ✅ Processed withdrawal ${w._id} — ₦${w.amountNGN}`)
        } catch (err) {
            console.error(`[WithdrawalCron] ❌ Failed withdrawal ${w._id}:`, err instanceof Error ? err.message : err)
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