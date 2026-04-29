import axios, { type AxiosInstance } from 'axios'
import crypto from 'crypto'
import { AppError } from './appError.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaystackInitializeResponse {
    authorizationUrl: string
    accessCode: string
    reference: string
}

export interface PaystackVerifyResponse {
    status: 'success' | 'failed' | 'abandoned' | 'pending'
    amount: number // kobo
    amountNGN: number // naira
    reference: string
    paidAt: string | null
    channel: string
    currency: string
    metadata: Record<string, unknown>
    customer: { email: string; name: string }
}

export interface PaystackTransferRecipient {
    recipientCode: string
    id: number
    name: string
    accountNumber: string
    bankCode: string
}

export interface PaystackTransferResponse {
    transferCode: string
    reference: string
    amount: number
    status: string
}

// ─── Internal ─────────────────────────────────────────────────────────────────

const getSecret = (): string => {
    const s = process.env.PAYSTACK_SECRET
    if (!s) throw new Error('PAYSTACK_SECRET is not set')
    return s
}

const client = (): AxiosInstance =>
    axios.create({
        baseURL: 'https://api.paystack.co',
        headers: {
            Authorization: `Bearer ${getSecret()}`,
            'Content-Type': 'application/json',
        },
    })

// ─── Transactions ─────────────────────────────────────────────────────────────

/**
 * Initialize a payment — returns the checkout URL and reference.
 * amountNGN is in Naira; internally converted to kobo.
 */
export const initializeTransaction = async (
    email: string,
    amountNGN: number,
    reference: string,
    metadata: Record<string, unknown> = {},
    callbackUrl?: string,
): Promise<PaystackInitializeResponse> => {
    const payload: Record<string, unknown> = {
        email,
        amount: Math.round(amountNGN * 100),
        reference,
        metadata,
        channels: ['card', 'bank', 'ussd', 'mobile_money'],
    }
    if (callbackUrl) payload.callback_url = callbackUrl

    const { data } = await client().post('/transaction/initialize', payload)
    if (!data.status)
        throw new AppError(`Paystack init failed: ${data.message}`, 502)

    return {
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        reference: data.data.reference,
    }
}

/**
 * Verify a transaction after payment.
 */
export const verifyTransaction = async (
    reference: string,
): Promise<PaystackVerifyResponse> => {
    const { data } = await client().get(
        `/transaction/verify/${encodeURIComponent(reference)}`,
    )
    if (!data.status)
        throw new AppError(`Paystack verify failed: ${data.message}`, 502)

    const tx = data.data
    return {
        status: tx.status,
        amount: tx.amount,
        amountNGN: tx.amount / 100,
        reference: tx.reference,
        paidAt: tx.paid_at ?? null,
        channel: tx.channel,
        currency: tx.currency,
        metadata: tx.metadata ?? {},
        customer: {
            email: tx.customer?.email ?? '',
            name: [tx.customer?.first_name, tx.customer?.last_name]
                .filter(Boolean)
                .join(' '),
        },
    }
}

// ─── Transfers (payouts) ──────────────────────────────────────────────────────

/**
 * Create a transfer recipient for a Nigerian bank account.
 */
export const createTransferRecipient = async (
    bankCode: string,
    accountNumber: string,
    name: string,
    currency = 'NGN',
): Promise<PaystackTransferRecipient> => {
    const { data } = await client().post('/transferrecipient', {
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
    })
    if (!data.status)
        throw new AppError(`Paystack recipient failed: ${data.message}`, 502)

    const r = data.data
    return {
        recipientCode: r.recipient_code,
        id: r.id,
        name: r.name,
        accountNumber: r.details?.account_number ?? accountNumber,
        bankCode: r.details?.bank_code ?? bankCode,
    }
}

/**
 * Initiate a payout transfer. amountNGN in Naira.
 */
export const initiateTransfer = async (
    amountNGN: number,
    recipientCode: string,
    reference: string,
    reason = 'CampusBaze payout',
): Promise<PaystackTransferResponse> => {
    const { data } = await client().post('/transfer', {
        source: 'balance',
        amount: Math.round(amountNGN * 100),
        recipient: recipientCode,
        reference,
        reason,
    })
    if (!data.status)
        throw new AppError(`Paystack transfer failed: ${data.message}`, 502)

    const t = data.data
    return {
        transferCode: t.transfer_code,
        reference: t.reference,
        amount: t.amount,
        status: t.status,
    }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

/**
 * Verify Paystack webhook HMAC signature.
 * Pass the raw request body (string) and the x-paystack-signature header.
 */
export const verifyWebhookSignature = (
    rawBody: string,
    signature: string,
): boolean => {
    const hash = crypto
        .createHmac('sha512', getSecret())
        .update(rawBody)
        .digest('hex')
    return hash === signature
}

/**
 * Charge a previously saved card using its authorization_code.
 * Used for subscription renewals — no redirect needed.
 * Returns the same shape as verifyTransaction so the webhook handler can reuse it.
 */
export const chargeAuthorization = async (
    authorizationCode: string,
    email: string,
    amountNGN: number,
    reference: string,
    metadata: Record<string, unknown> = {},
): Promise<PaystackVerifyResponse> => {
    const { data } = await client().post('/transaction/charge_authorization', {
        authorization_code: authorizationCode,
        email,
        amount: Math.round(amountNGN * 100),
        reference,
        metadata,
    })
    if (!data.status)
        throw new AppError(
            `Paystack charge_authorization failed: ${data.message}`,
            502,
        )

    const tx = data.data
    return {
        status: tx.status,
        amount: tx.amount,
        amountNGN: tx.amount / 100,
        reference: tx.reference,
        paidAt: tx.paid_at ?? null,
        channel: tx.channel,
        currency: tx.currency,
        metadata: tx.metadata ?? {},
        customer: {
            email: tx.customer?.email ?? '',
            name: [tx.customer?.first_name, tx.customer?.last_name]
                .filter(Boolean)
                .join(' '),
        },
    }
}

export const initiateRefund = async (
    reference: string,
    amountNGN?: number, // optional partial refund
): Promise<{ status: string }> => {
    const payload: Record<string, unknown> = {
        transaction: reference,
    }

    if (amountNGN) {
        payload.amount = Math.round(amountNGN * 100)
    }

    const { data } = await client().post('/refund', payload)

    if (!data.status) {
        throw new AppError(`Paystack refund failed: ${data.message}`, 502)
    }

    return { status: data.data.status }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const listBanks = async (): Promise<
    Array<{ name: string; code: string }>
> => {
    const { data } = await client().get('/bank?currency=NGN&per_page=100')
    if (!data.status) return []
    return (data.data as Array<{ name: string; code: string }>).map((b) => ({
        name: b.name,
        code: b.code,
    }))
}

/** Generate a unique Paystack-safe reference string */
export const generateReference = (prefix = 'CB'): string =>
    `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`
