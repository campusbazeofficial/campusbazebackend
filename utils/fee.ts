// utils/fee.ts

import {
    CBC_FEE_TABLE,
    // COMMISSION_RATES,
    CORPORATE_SURCHARGE,
    SUBSCRIPTION_TIER,
} from './constant.js'

/**
 * Calculate the base CBC contact fee for a given job/errand value.
 */
export function getCbcContactFee(amountNGN: number, isStudent: boolean): number {
    const row =
        CBC_FEE_TABLE.find((r) => amountNGN <= r.maxNGN) ??
        CBC_FEE_TABLE[CBC_FEE_TABLE.length - 1]
    return isStudent ? row.student : row.standard
}

/**
 * Apply a plan's CBC discount percentage to a base fee.
 * cbcDiscount is stored as a whole number (e.g. 10 = 10%, 25 = 25%).
 */
export function applyPlanDiscount(baseFee: number, cbcDiscount: number): number {
    if (!cbcDiscount || cbcDiscount <= 0) return baseFee
    return Math.floor(baseFee * (1 - cbcDiscount / 100))
}

// /**
//  * @deprecated — use resolveCommissionRate(plan, isStudent, isCorporate) instead.
//  * Kept for call sites not yet migrated to DB-driven plan lookup.
//  */
// export function getCommissionRate(
//     subscriptionTier: string,
//     isStudent: boolean,
//     isCorporate: boolean,
// ): number {
//     const rates =
//         COMMISSION_RATES[subscriptionTier] ?? COMMISSION_RATES[SUBSCRIPTION_TIER.FREE]
//     if (isCorporate) return rates.standard + CORPORATE_SURCHARGE
//     return isStudent ? rates.student : rates.standard
// }

/**
 * DB-driven replacement for getCommissionRate.
 * Pass the plan document/snapshot — no hardcoded lookup needed.
 */
export function resolveCommissionRate(
    plan: { commissionRate: number; studentCommissionRate: number },
    isStudent: boolean,
    isCorporate: boolean,
): number {
    if (isCorporate) return plan.commissionRate + CORPORATE_SURCHARGE
    return isStudent ? plan.studentCommissionRate : plan.commissionRate
}

// rate is stored as a whole number (e.g. 10 = 10%) — divide by 100 before applying
export function calculateCommission(amountNGN: number, rate: number): number {
    return Math.round(amountNGN * (rate / 100) * 100) / 100
}

export function calculateSellerEarnings(amountNGN: number, commissionRate: number): number {
    const commission = calculateCommission(amountNGN, commissionRate)
    return Math.round((amountNGN - commission) * 100) / 100
}