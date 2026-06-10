// scripts/test-email-queue.ts
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

import '../workers/email.worker'
import { emailQueue } from '../utils/queue'

async function run() {
    // ── Connect to DB first ────────────────────────────────────────────────
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('✅ DB connected')

    const TEST_USER_ID = '69f261d320d2b47708997293'

    await emailQueue.add('support-ticket-created', {
        userId: TEST_USER_ID,
        ticketNumber: 'TKT-0001',
        ticketId: 'abc123',
        category: 'Payment',
        type: 'Withdrawal Issue',
        description: 'My withdrawal has been pending for over 48 hours.',
        priority: 'high',
    })

    await emailQueue.add('support-ticket-updated', {
        userId: TEST_USER_ID,
        ticketNumber: 'TKT-0001',
        ticketId: 'abc123',
        category: 'Payment',
        type: 'Withdrawal Issue',
        status: 'in_review',
        adminNote: 'We are looking into this, expect a resolution within 24 hours.',
    })

    await emailQueue.add('order-delivered', {
        buyerId: TEST_USER_ID,
        listingTitle: 'Logo Design Package',
        orderId: 'ORD-9999',
    })

    await emailQueue.add('order-disputed', {
        buyerId: TEST_USER_ID,
        sellerId: TEST_USER_ID,
        listingTitle: 'Logo Design Package',
        orderId: 'ORD-9999',
    })

    await emailQueue.add('verification-approved', {
        userId: TEST_USER_ID,
        docTypeLabel: 'Student ID',
    })

    await emailQueue.add('verification-rejection', {
        userId: TEST_USER_ID,
        docTypeLabel: 'Student ID',
        adminNote: 'The uploaded image was blurry. Please resubmit a clear photo.',
    })

    console.log('✅ All test jobs queued — waiting for handlers...')

    await new Promise(resolve => setTimeout(resolve, 10_000))

    await mongoose.disconnect()
    process.exit(0)
}

run().catch(console.error)