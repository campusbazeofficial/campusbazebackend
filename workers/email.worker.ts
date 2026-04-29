import {
    sendNewOrderEmailToSeller,
    sendOrderCancelledBySellerEmail,
    sendOrderCompletedEmail,
    sendOrderDeliveredEmail,
    sendOrderDisputedEmail,
    sendOrderDisputeResolvedEmail,
    sendOrderPlacedEmail,
    sendOrderRevisionEmail,
    sendErrandBidAcceptedEmail,
    sendErrandStartedEmail,
    sendErrandCompletedEmail,
    sendErrandConfirmedEmail,
    sendErrandDisputedEmail,
    sendErrandDisputeResolvedEmail,
    sendSupportTicketUpdatedEmail,
    sendSupportTicketCreatedEmail,
} from '../utils/emailSender'
import { emailQueue } from '../utils/queue'

// ─── Order processors ─────────────────────────────────────────────────────────

emailQueue.process('order-created', async (data: any) => {
    const { buyerEmail, sellerId, listingTitle, orderId } = data
    await Promise.all([
        sendOrderPlacedEmail(buyerEmail, listingTitle, orderId),
        sendNewOrderEmailToSeller(sellerId, listingTitle, orderId),
    ])
})

emailQueue.process('order-delivered', async (data: any) => {
    const { buyerId, listingTitle, orderId } = data
    await sendOrderDeliveredEmail(buyerId, listingTitle, orderId)
})

emailQueue.process('order-completed', async (data: any) => {
    const { sellerId, listingTitle, orderId, earnings } = data
    await sendOrderCompletedEmail(sellerId, listingTitle, orderId, earnings)
})

emailQueue.process('order-revision-requested', async (data: any) => {
    const { sellerId, listingTitle, orderId } = data
    await sendOrderRevisionEmail(sellerId, listingTitle, orderId)
})

emailQueue.process('order-disputed', async (data: any) => {
    const { buyerId, sellerId, listingTitle, orderId } = data
    await Promise.all([
        sendOrderDisputedEmail(buyerId, listingTitle, orderId),
        sendOrderDisputedEmail(sellerId, listingTitle, orderId),
    ])
})

emailQueue.process('order-dispute-resolved', async (data: any) => {
    const { buyerId, sellerId, listingTitle, orderId, outcome } = data
    await Promise.all([
        sendOrderDisputeResolvedEmail(buyerId, listingTitle, orderId, outcome),
        sendOrderDisputeResolvedEmail(sellerId, listingTitle, orderId, outcome),
    ])
})

emailQueue.process('order-cancelled-by-seller', async (data: any) => {
    const { buyerId, listingTitle, orderId, reason } = data
    await sendOrderCancelledBySellerEmail(
        buyerId,
        listingTitle,
        orderId,
        reason,
    )
})

// ─── Errand processors ────────────────────────────────────────────────────────

emailQueue.process('errand-bid-accepted', async (data: any) => {
    const { runnerId, errandTitle, errandId, amount, escrowReference } = data
    await sendErrandBidAcceptedEmail(
        runnerId,
        errandTitle,
        errandId,
        amount,
        escrowReference,
    )
})

emailQueue.process('errand-started', async (data: any) => {
    const { posterId, errandTitle, errandId } = data
    await sendErrandStartedEmail(posterId, errandTitle, errandId)
})

emailQueue.process('errand-completed', async (data: any) => {
    const { posterId, errandTitle, errandId } = data
    await sendErrandCompletedEmail(posterId, errandTitle, errandId)
})

emailQueue.process('errand-confirmed', async (data: any) => {
    const { runnerId, errandTitle, errandId, earnings } = data
    await sendErrandConfirmedEmail(runnerId, errandTitle, errandId, earnings)
})

emailQueue.process('errand-disputed', async (data: any) => {
    const { posterId, runnerId, errandTitle, errandId } = data
    await Promise.all([
        sendErrandDisputedEmail(posterId, errandTitle, errandId),
        sendErrandDisputedEmail(runnerId, errandTitle, errandId),
    ])
})

emailQueue.process('errand-dispute-resolved', async (data: any) => {
    const { posterId, runnerId, errandTitle, errandId, outcome } = data
    await Promise.all([
        sendErrandDisputeResolvedEmail(
            posterId,
            errandTitle,
            errandId,
            outcome,
        ),
        sendErrandDisputeResolvedEmail(
            runnerId,
            errandTitle,
            errandId,
            outcome,
        ),
    ])
})

emailQueue.process('support-ticket-created', async (data: any) => {
    const { userId, ticketNumber, ticketId, category, type, description, priority } = data
    await sendSupportTicketCreatedEmail(
        userId,
        ticketNumber,
        ticketId,
        category,
        type,
        description,
        priority,
    )
})

emailQueue.process('support-ticket-updated', async (data: any) => {
    const { userId, ticketNumber, ticketId, category, type, status, adminNote } = data
    await sendSupportTicketUpdatedEmail(
        userId,
        ticketNumber,
        ticketId,
        category,
        type,
        status,
        adminNote ?? '',
    )
})

