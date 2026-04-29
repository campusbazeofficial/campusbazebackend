import cron from "node-cron";
import EarningsClearance, { CLEARANCE_STATUS } from '../models/earnin.js'
import { EarningsClearanceService } from '../services/earnings-clearance.service.js'
const clearanceService = new EarningsClearanceService()

async function processClearances() {
    const clearances = await EarningsClearance.find({
        status: CLEARANCE_STATUS.PENDING,
        clearAt: { $lte: new Date() },
    })
        .select('_id')
        .limit(50)
        .lean()

    if (clearances.length === 0) return

    console.log(`[ClearanceCron] ${clearances.length} ready`)

    for (const c of clearances) {
        try {
            await clearanceService.clear(c._id.toString(), 'system')
        } catch (err) {
            console.error(`[ClearanceCron] failed ${c._id}`, err)
        }
    }
}

export const startClearanceCron = () => {
    const schedule =
        process.env.NODE_ENV === 'production'
            ? '*/10 * * * *' // every 10 mins
            : '* * * * *'

    cron.schedule(schedule, async () => {
        try {
            await processClearances()
        } catch (err) {
            console.error('[ClearanceCron] error', err)
        }
    })

    console.log(`💰 Clearance cron started — ${schedule}`)
}