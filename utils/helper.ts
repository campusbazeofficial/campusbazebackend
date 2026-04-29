import User from "../models/user.model";
import { ForbiddenError, NotFoundError } from "./appError";
import { SUBSCRIPTION_TIER, SubscriptionTier, USER_ROLE } from "./constant";

function generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return Array.from(
        { length: 8 },
        () => chars[Math.floor(Math.random() * chars.length)],
    ).join('')
}

export async function generateUniqueReferralCode(): Promise<string> {
  let code;
  let exists;

  do {
    code = generateReferralCode();
    exists = await User.exists({ referralCode: code });
  } while (exists);

  return code;
}

export async function assertEligibleForTier(
    userId: string,
    tier: SubscriptionTier,
    isStudent?: boolean,
) {
    const user = await User.findById(userId)
        .select('+identityVerificationLevel isStudentVerified role')
        //       ^ ADD + prefix
        .lean()
    if (!user) throw new NotFoundError('User')

    const isCorporateTier =
        tier === SUBSCRIPTION_TIER.CORPORATE_FREE ||
        tier === SUBSCRIPTION_TIER.CORPORATE_PRO ||
        tier === SUBSCRIPTION_TIER.CORPORATE_ELITE

    const isCorporateUser = user.role === USER_ROLE.CORPORATE

    if (isCorporateTier && !isCorporateUser) {
        throw new ForbiddenError(
            'Corporate plans are only available to corporate accounts.',
        )
    }

    if (!isCorporateTier && isCorporateUser) {
        throw new ForbiddenError(
            'Individual plans are not available to corporate accounts.',
        )
    }

    if (tier === SUBSCRIPTION_TIER.ELITE) {
        if ((user.identityVerificationLevel ?? 0) < 2) {
            throw new ForbiddenError(
                'Elite plan requires Tier 2 identity verification (phone + identity document).',
            )
        }
    }

    if (isStudent && !user.isStudentVerified) {
        throw new ForbiddenError(
            'Student pricing requires Tier 1A verification. Please submit your student ID first.',
        )
    }
}

export function getSubscriptionWeight(tier: string) {
    switch (tier) {
        case 'elite':           return 3
        case 'corporate_elite': return 3
        case 'pro':             return 2
        case 'corporate_pro':   return 2
        case 'basic':           return 1
        default:                return 0
    }
}

export function normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')

    // 08012345678 → 2348012345678
    if (digits.startsWith('0') && digits.length === 11) {
        return `234${digits.slice(1)}`
    }

    // +2348012345678 → 2348012345678
    if (digits.startsWith('234') && digits.length === 13) {
        return digits
    }

    // already correct or unknown format — return as-is
    return digits
}

export function isValidNigerianPhone(phone: string): boolean {
    const normalised = normalisePhone(phone)
    return /^234[789][01]\d{8}$/.test(normalised)
}