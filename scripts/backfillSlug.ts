/// <reference types="node" />
/**
 * fix-commission.ts
 *
 * Recalculates commissionNGN and sellerEarningsNGN for all Orders and Errands
 * that were saved while the commission bug was active (rate applied as-is
 * instead of rate/100).
 *
 * USAGE
 * ─────
 * # Dry run — prints what would change, touches nothing
 * DRY_RUN=true npx tsx scripts/fix-commission.ts
 *
 * # Live run — writes to DB
 * npx tsx scripts/fix-commission.ts
 *
 * REQUIREMENTS
 * ────────────
 * MONGO_URI must be set in your .env (the script loads it automatically).
 */

import 'dotenv/config'
import mongoose from 'mongoose'

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === 'true'
const MONGO_URI = process.env.MONGO_URI

if (!MONGO_URI) {
    console.error('❌  MONGO_URI is not set in .env')
    process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Same logic as your fixed calculateCommission in fee.ts */
function calcCommission(amount: number, rate: number): number {
    return Math.round(amount * (rate / 100) * 100) / 100
}

function calcSellerEarnings(amount: number, commission: number): number {
    return Math.round((amount - commission) * 100) / 100
}

/** A stored value was produced by the buggy formula if commission > amount */
function isBuggy(commissionNGN: number, amount: number): boolean {
    return commissionNGN > amount
}

// ─── Counters ─────────────────────────────────────────────────────────────────

const stats = {
    orders:  { scanned: 0, fixed: 0, skipped: 0, errors: 0 },
    errands: { scanned: 0, fixed: 0, skipped: 0, errors: 0 },
}

// ─── Fix Orders ───────────────────────────────────────────────────────────────

async function fixOrders(db: mongoose.mongo.Db) {
    console.log('\n── Orders ──────────────────────────────────────────')

    // Only fetch orders where commission is clearly wrong
    const orders = await db.collection('orders').find({
        commissionRate:  { $exists: true, $gt: 0 },
        amount:          { $exists: true, $gt: 0 },
        commissionNGN:   { $exists: true },
        $expr: { $gt: ['$commissionNGN', '$amount'] },
    }).toArray()

    stats.orders.scanned = orders.length
    console.log(`   Found ${orders.length} order(s) with buggy commission`)

    for (const order of orders) {
        try {
            const amount        = order.amount        as number
            const commissionRate = order.commissionRate as number
            const oldCommission  = order.commissionNGN  as number
            const oldEarnings    = order.sellerEarningsNGN as number

            if (!isBuggy(oldCommission, amount)) {
                stats.orders.skipped++
                continue
            }

            const newCommission = calcCommission(amount, commissionRate)
            const newEarnings   = calcSellerEarnings(amount, newCommission)

            console.log(
                `   Order ${order._id}` +
                `  amount=₦${amount.toLocaleString()}` +
                `  rate=${commissionRate}%` +
                `  commission: ₦${oldCommission} → ₦${newCommission}` +
                `  earnings: ₦${oldEarnings} → ₦${newEarnings}` +
                (DRY_RUN ? '  [DRY RUN]' : ''),
            )

            if (!DRY_RUN) {
                await db.collection('orders').updateOne(
                    { _id: order._id },
                    {
                        $set: {
                            commissionNGN:    newCommission,
                            sellerEarningsNGN: newEarnings,
                            _commissionFixed:  true,   // audit flag
                            _commissionFixedAt: new Date(),
                        },
                    },
                )
            }

            stats.orders.fixed++
        } catch (err) {
            console.error(`   ❌ Failed on order ${order._id}:`, err)
            stats.orders.errors++
        }
    }
}

// ─── Fix Errands ──────────────────────────────────────────────────────────────

async function fixErrands(db: mongoose.mongo.Db) {
    console.log('\n── Errands ─────────────────────────────────────────')

    const errands = await db.collection('errands').find({
        commissionRate:    { $exists: true, $gt: 0 },
        agreedAmount:      { $exists: true, $gt: 0 },
        commissionNGN:     { $exists: true },
        $expr: { $gt: ['$commissionNGN', '$agreedAmount'] },
    }).toArray()

    stats.errands.scanned = errands.length
    console.log(`   Found ${errands.length} errand(s) with buggy commission`)

    for (const errand of errands) {
        try {
            const amount        = errand.agreedAmount   as number
            const commissionRate = errand.commissionRate as number
            const oldCommission  = errand.commissionNGN  as number
            const oldEarnings    = errand.sellerEarningsNGN as number

            if (!isBuggy(oldCommission, amount)) {
                stats.errands.skipped++
                continue
            }

            const newCommission = calcCommission(amount, commissionRate)
            const newEarnings   = calcSellerEarnings(amount, newCommission)

            console.log(
                `   Errand ${errand._id}` +
                `  agreedAmount=₦${amount.toLocaleString()}` +
                `  rate=${commissionRate}%` +
                `  commission: ₦${oldCommission} → ₦${newCommission}` +
                `  earnings: ₦${oldEarnings} → ₦${newEarnings}` +
                (DRY_RUN ? '  [DRY RUN]' : ''),
            )

            if (!DRY_RUN) {
                await db.collection('errands').updateOne(
                    { _id: errand._id },
                    {
                        $set: {
                            commissionNGN:     newCommission,
                            sellerEarningsNGN:  newEarnings,
                            _commissionFixed:   true,
                            _commissionFixedAt: new Date(),
                        },
                    },
                )
            }

            stats.errands.fixed++
        } catch (err) {
            console.error(`   ❌ Failed on errand ${errand._id}:`, err)
            stats.errands.errors++
        }
    }
}

// ─── Clearance audit (read-only, no writes) ───────────────────────────────────

async function auditClearances(db: mongoose.mongo.Db) {
    console.log('\n── Earnings Clearances (audit only) ────────────────')

    // Flag clearances with suspiciously large amounts — manual review needed
    // Threshold: anything over ₦500,000 is almost certainly a bug artifact
    const THRESHOLD = 500_000

    const suspicious = await db.collection('earningsclearances').find({
        amountNGN: { $gt: THRESHOLD },
    }).toArray()

    if (suspicious.length === 0) {
        console.log('   ✅ No suspicious clearances found')
        return
    }

    console.log(`   ⚠️  ${suspicious.length} clearance(s) exceed ₦${THRESHOLD.toLocaleString()} — manual review required:`)
    for (const c of suspicious) {
        console.log(
            `      Clearance ${c._id}` +
            `  userId=${c.userId}` +
            `  source=${c.sourceType}/${c.sourceId}` +
            `  amount=₦${(c.amountNGN as number).toLocaleString()}` +
            `  status=${c.status}`,
        )
    }

    console.log('\n   These are NOT auto-fixed — amounts may have already')
    console.log('   moved to pendingEarnings/ngnEarnings wallets.')
    console.log('   Review each one and correct wallet balances manually.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════')
    console.log('  Commission Fix Migration')
    console.log(`  Mode: ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE (writing to DB)'}`)
    console.log('═══════════════════════════════════════════════════')

    await mongoose.connect(MONGO_URI!)
    console.log('✅  Connected to MongoDB')

    const db = mongoose.connection.db!

    await fixOrders(db)
    await fixErrands(db)
    await auditClearances(db)

    console.log('\n═══════════════════════════════════════════════════')
    console.log('  Summary')
    console.log('═══════════════════════════════════════════════════')
    console.log(`  Orders  — scanned: ${stats.orders.scanned}  fixed: ${stats.orders.fixed}  skipped: ${stats.orders.skipped}  errors: ${stats.orders.errors}`)
    console.log(`  Errands — scanned: ${stats.errands.scanned}  fixed: ${stats.errands.fixed}  skipped: ${stats.errands.skipped}  errors: ${stats.errands.errors}`)

    if (DRY_RUN) {
        console.log('\n  🟡 DRY RUN complete — nothing was written.')
        console.log('     Re-run without DRY_RUN=true to apply changes.')
    } else {
        console.log('\n  ✅ Migration complete.')
        console.log('     Fixed documents have _commissionFixed: true for audit trail.')
    }

    await mongoose.disconnect()
}

main().catch((err) => {
    console.error('❌ Migration failed:', err)
    process.exit(1)
})