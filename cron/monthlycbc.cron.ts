import cron from 'node-cron'
import dayjs from 'dayjs'
import Subscription from '../models/subscription.model.js'
import { CbcService } from '../services/cbc.service.js'
import { NotificationService } from '../services/notification.service.js'
import { SUBSCRIPTION_STATUS, NOTIFICATION_TYPE } from '../utils/constant.js'
import { WALLET_TX_TYPE } from '../models/wallet.model.js'

const cbcService = new CbcService()
const notificationService = new NotificationService()

export async function runMonthlyCbcCreditJob(): Promise<void> {
    console.log('[CBC Cron] Starting monthly CBC credit job...')

    const now = dayjs()
    const startOfMonth = now.startOf('month').toDate()

    const subscriptions = await Subscription.find({
        status: SUBSCRIPTION_STATUS.ACTIVE,
        expiresAt: { $gt: now.toDate() },
        'planSnapshot.monthlyCbc': { $gt: 0 },
        lastCbcCreditedAt: { $lt: startOfMonth },
    }).lean()

    console.log(
        `[CBC Cron] Found ${subscriptions.length} subscriptions to credit`,
    )

    let credited = 0
    let failed = 0

    for (const sub of subscriptions) {
        try {
            const amount = Number(sub.planSnapshot?.monthlyCbc ?? 0)
            if (amount <= 0) continue

            await cbcService.credit(
                sub.userId.toString(),
                amount,
                WALLET_TX_TYPE.CBC_MONTHLY_ALLOCATION,
                `Monthly CBC allocation — ${sub.planSnapshot?.nameLabel} plan`,
                `cbc_monthly_${sub._id}_${now.format('YYYY_MM')}`,
            )

            await Subscription.findByIdAndUpdate(sub._id, {
                lastCbcCreditedAt: now.toDate(),
            })

            notificationService
                .create({
                    userId: sub.userId.toString(),
                    type: NOTIFICATION_TYPE.CBC_CREDIT,
                    title: 'Monthly CBC allowance credited',
                    body: `${amount} CBC coins have been added to your wallet as your monthly ${sub.planSnapshot?.nameLabel} allowance.`,
                    data: { amount, tier: sub.tier },
                })
                .catch(() => null)

            credited++
        } catch (err) {
            console.error(`[CBC Cron] Failed for subscription ${sub._id}:`, err)
            failed++
        }
    }

    console.log(`[CBC Cron] Done — credited: ${credited}, failed: ${failed}`)
}

export function startMonthlyCbcCron() {
    cron.schedule('0 2 1 * *', async () => {
        try {
            await runMonthlyCbcCreditJob()
        } catch (err) {
            console.error('[CBC Cron] Job failed:', err)
        }
    })
}
