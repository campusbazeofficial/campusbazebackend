import type { Request, Response } from 'express'
import { verifyWebhookSignature } from './paystack.js'
import { CbcService } from '../services/cbc.service.js'
import { ErrandService } from '../services/errand.service.js'
import { ServiceListingService } from '../services/services.service.js'
import { SubscriptionService } from '../services/subscription.service.js'
import { WithdrawalService } from '../services/withdraw.service.js'
import { NotificationService } from '../services/notification.service.js'
import { WalletTransaction, WALLET_TX_TYPE } from '../models/wallet.model.js'
import { NOTIFICATION_TYPE, type SubscriptionTier } from './constant.js'
import Errand from '../models/errand.model.js'
import Order from '../models/order.model.js'

// ─── Event types handled ──────────────────────────────────────────────────────

const HANDLED_EVENTS = [
    'charge.success',
    'transfer.success',
    'transfer.failed',
] as const

type HandledEvent = (typeof HANDLED_EVENTS)[number]

// ─── Payload shapes ───────────────────────────────────────────────────────────

interface ChargeSuccessData {
    reference: string
    amount: number // kobo
    metadata: {
        userId?: string
        type?: 'cbc_purchase' | 'escrow' | 'subscription'
        cbcAmount?: number
        tier?: string
        priceNGN?: number
        [key: string]: unknown
    }
    customer: { email: string }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export const paystackWebhookHandler = async (
    req: Request,
    res: Response,
): Promise<void> => {
    // 1. HMAC signature verification — reject anything not from Paystack
    const signature = req.headers['x-paystack-signature'] as string | undefined
    const rawBody: string =
        (req as Request & { rawBody?: string }).rawBody ??
        JSON.stringify(req.body)

    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
        res.status(401).json({
            success: false,
            data: { message: 'Invalid signature' },
        })
        return
    }

    // 2. Acknowledge immediately — Paystack retries if no fast 200
    res.status(200).json({ success: true, data: { message: 'Received' } })

    // 3. Process async — response already sent, errors only logged
    const event = req.body?.event as string
    const eventData = req.body?.data as unknown

    if (!HANDLED_EVENTS.includes(event as HandledEvent)) return

    try {
        switch (event as HandledEvent) {
            case 'charge.success':
                await handleChargeSuccess(eventData as ChargeSuccessData)
                break
            case 'transfer.success':
                await handleTransferSuccess(eventData as { reference: string })
                break
            case 'transfer.failed':
                await handleTransferFailed(eventData as { reference: string })
                break
        }
    } catch (err) {
        console.error('[Webhook] Processing error:', err)
    }
}

// ─── charge.success ───────────────────────────────────────────────────────────

async function handleChargeSuccess(data: ChargeSuccessData): Promise<void> {
    const { reference, amount, metadata } = data

    if (!metadata?.userId || !metadata?.type) {
        console.warn(
            `[Webhook] charge.success — missing metadata on ref ${reference}`,
        )
        return
    }

    const { userId, type } = metadata

    switch (type) {
        case 'cbc_purchase': {
            const cbcAmount = metadata.cbcAmount as number | undefined
            if (!cbcAmount || cbcAmount <= 0) {
                console.warn(
                    `[Webhook] cbc_purchase — missing cbcAmount on ref ${reference}`,
                )
                return
            }

            // Idempotency: skip if already processed
            const alreadyProcessed = await WalletTransaction.exists({
                reference,
            })
            if (alreadyProcessed) {
                console.log(
                    `[Webhook] cbc_purchase already processed — ref ${reference}`,
                )
                return
            }

            const cbcService = new CbcService()
            await cbcService.credit(
                userId,
                cbcAmount,
                WALLET_TX_TYPE.PURCHASE,
                'CBC purchase via Paystack',
                reference,
                { paystackAmountKobo: amount },
            )
            console.log(
                `[Webhook] Credited ${cbcAmount} CBC → user ${userId} (ref ${reference})`,
            )

            // In-app notification
            new NotificationService()
                .create({
                    userId,
                    type: NOTIFICATION_TYPE.PAYMENT,
                    title: 'CBC coins credited 🪙',
                    body: `${cbcAmount} CBC coins have been added to your wallet.`,
                    data: { cbcAmount, reference },
                })
                .catch(() => null)
            break
        }

        case 'escrow': {
            // ── Try order first ───────────────────────────────────────────
            const order = await Order.findOne({ escrowReference: reference })
            if (order) {
                if (order.paymentCaptured) {
                    console.log(
                        `[Webhook] Order escrow already captured — ref ${reference}`,
                    )
                    break
                }
                order.paymentProvider = 'paystack'
                order.paymentReference = reference
                order.paymentCaptured = true
                await order.save()

                // ✅ Pass reference, not _id
                await new ServiceListingService().confirmOrderEscrow(reference)
                console.log(
                    `[Webhook] Order escrow confirmed — ref ${reference}`,
                )
                break
            }

            // ── Fall through to errand — now reachable ────────────────────
            const errand = await Errand.findOne({ escrowReference: reference })
            if (errand) {
                if (errand.paymentCaptured) {
                    console.log(
                        `[Webhook] Errand escrow already captured — ref ${reference}`,
                    )
                    break
                }
                errand.paymentProvider = 'paystack'
                errand.paymentReference = reference
                errand.paymentCaptured = true
                await errand.save()

                // ✅ Pass reference, not _id
                await new ErrandService().confirmEscrow(reference)
                console.log(
                    `[Webhook] Errand escrow confirmed — ref ${reference}`,
                )
                break
            }

            console.warn(
                `[Webhook] Unknown escrow reference — ref ${reference}`,
            )
            break
        }

        case 'subscription': {
            const tier = metadata.tier as SubscriptionTier | undefined
            if (!tier) {
                console.warn(
                    `[Webhook] subscription missing tier on ref ${reference}`,
                )
                return
            }

            // Pass authorization_code so renewals can charge without redirect
            const authCode = (
                data as { authorization?: { authorization_code?: string } }
            ).authorization?.authorization_code

            const subscriptionService = new SubscriptionService()
            await subscriptionService.activateSubscription(
                reference,
                userId,
                tier,
                authCode,
            )
            console.log(
                `[Webhook] Subscription activated — tier ${tier}, user ${userId} (ref ${reference})`,
            )

            // In-app notification
            new NotificationService()
                .create({
                    userId,
                    type: NOTIFICATION_TYPE.PAYMENT,
                    title: 'Subscription activated 🚀',
                    body: `Your ${tier} plan is now active. Enjoy your upgraded benefits.`,
                    data: { tier, reference },
                })
                .catch(() => null)
            break
        }
    }
}

// ─── transfer.success / transfer.failed ──────────────────────────────────────

async function handleTransferSuccess(data: {
    reference: string
}): Promise<void> {
    const withdrawalService = new WithdrawalService()
    await withdrawalService.handleTransferSuccess(data.reference)
    console.log(`[Webhook] Transfer success — ref ${data.reference}`)
}

async function handleTransferFailed(data: {
    reference: string
    reason?: string
}): Promise<void> {
    const withdrawalService = new WithdrawalService()
    await withdrawalService.handleTransferFailed(data.reference, data.reason)
    console.log(`[Webhook] Transfer failed — ref ${data.reference}`)
}
