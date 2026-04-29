import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { APP_NAME, EMAIL_FROM } from "./constant.js";
import User from "../models/user.model.js";
export const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
export const RESET_URL = process.env.RESET_URL || "https://campus-base-ten.vercel.app/auth/reset-password";
export const RETRY_URL = process.env.RETRY_URL || "https://campus-base-ten.vercel.app/user/profile";
dotenv.config();

type SendEmailParams = {
  to: string;
  subject?: string;
  html: string;
};


export const STATUS_LABELS: Record<string, string> = {
    in_review: 'In Review',
    resolved:  'Resolved',
    closed:    'Closed',
    open:      'Open',
}
export const sendEmail = async ({
  to,
  subject = "New Mail",
  html,
}: SendEmailParams): Promise<boolean> => {
  try {
    if (!to || !subject || !html) {
      console.error("❌ Missing email fields");
      return false;
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error("❌ BREVO_API_KEY is missing");
      return false;
    }

    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: EMAIL_FROM,
          name: APP_NAME,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Brevo sent:", res.data);
    return true;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(
        "❌ Brevo email error:",
        error.response?.data || error.message
      );
    } else if (error instanceof Error) {
      console.error("❌ Brevo email error:", error.message);
    } else {
      console.error("❌ Brevo email error:", error);
    }
    return false;
  }
};

// ─── Load HTML template from views/ ──────────────────────────────────────────

function loadTemplate(name: string, vars: Record<string, string>): string {
  const templatePath = path.resolve(process.cwd(), "views", `${name}.html`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${name}.html`);
  }
  let html = fs.readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

// ─── Named senders ────────────────────────────────────────────────────────────

export const sendOtpEmail = async (
  to: string,
  otp: string,
  firstName: string
): Promise<boolean> => {
  const html = loadTemplate("otp-email", {
    firstName,
    otp,
    appName: APP_NAME,
    expiryMinutes: "10",
  });
  return sendEmail({ to, subject: `${otp} is your ${APP_NAME} verification code`, html });
};

export const sendWelcomeEmail = async (
  to: string,
  firstName: string
): Promise<boolean> => {
  const html = loadTemplate("welcome-email", {
    firstName,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to,
    subject: `Welcome to ${APP_NAME}!`,
    html
  });
};

export const sendCompanyWelcomeEmail = async (
  to: string,
  companyName: string
): Promise<boolean> => {
  const html = loadTemplate("welcome-company", {
    companyName,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to,
    subject: `Welcome to ${APP_NAME} — Your company is now onboard`,
    html
  });
};

export const sendPasswordResetEmail = async (
  to: string,
  firstName: string,
  resetUrl: string
): Promise<boolean> => {
  const html = loadTemplate("reset-password", {
    firstName,
    resetUrl,
    appName: APP_NAME,
  });
  return sendEmail({ to, subject: `Reset your ${APP_NAME} password`, html });
};

export const sendVerificationApprovedEmail = async (
  to: string,
  firstName: string,
  docTypeLabel: string
): Promise<boolean> => {
  const html = loadTemplate("verification-approved", {
    firstName,
    docTypeLabel,
    appName:   APP_NAME,
    clientUrl: CLIENT_URL,
  });
  return sendEmail({
    to,
    subject: `Your ${docTypeLabel} has been verified — ${APP_NAME}`,
    html,
  });
};

export const sendVerificationRejectedEmail = async (
  to: string,
  firstName: string,
  docTypeLabel: string,
  adminNote: string,
): Promise<boolean> => {

  const html = loadTemplate("verification-rejected", {
    firstName,
    docTypeLabel,
    adminNote,
    appName: APP_NAME,
  });
  return sendEmail({
    to,
    subject: `Action required: Your ${docTypeLabel} submission needs attention — ${APP_NAME}`,
    html,
  });
};

export const sendOrderPlacedEmail = async (
  to: string,
  listingTitle: string,
  orderId: string
): Promise<boolean> => {
  const html = loadTemplate("order-placed", {
    listingTitle,
    orderId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to,
    subject: `Order Confirmed — ${listingTitle}`,
    html,
  });
};

export const sendNewOrderEmailToSeller = async (
  sellerId: string,
  listingTitle: string,
  orderId: string
): Promise<boolean> => {
  const seller = await User.findById(sellerId)
    .select("email firstName role companyId")
    .populate("companyId", "name")
    .lean() as any;

  if (!seller?.email) {
    console.error("Seller email not found");
    return false;
  }

  const name =
    seller.role === "corporate"
      ? seller.companyId?.name || "Company"
      : seller.firstName || "Seller";

  const html = loadTemplate("new-order-seller", {
    name,
    listingTitle,
    orderId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: seller.email,
    subject: `You've received a new order — ${listingTitle}`,
    html,
  });
};

export const sendOrderCompletedEmail = async (
  sellerId: string,
  listingTitle: string,
  orderId: string,
  earnings: number
): Promise<boolean> => {
  const seller = await User.findById(sellerId)
    .select("email firstName role companyId")
    .populate("companyId", "name")
    .lean() as any;

  if (!seller?.email) {
    console.error("Seller email not found");
    return false;
  }

  const name =
    seller.role === "corporate"
      ? seller.companyId?.name || "Company"
      : seller.firstName || "Seller";

  const html = loadTemplate("order-completed", {
    name,
    listingTitle,
    orderId,
    earnings: earnings.toLocaleString(),
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: seller.email,
    subject: `Order completed — ₦${earnings.toLocaleString()} earned`,
    html,
  });
};

export const sendOrderDeliveredEmail = async (
  buyerId: string,
  listingTitle: string,
  orderId: string
): Promise<boolean> => {
  const buyer = await User.findById(buyerId)
    .select("email firstName")
    .lean();

  if (!buyer?.email) {
    console.error("Buyer email not found");
    return false;
  }

  const html = loadTemplate("order-delivered", {
    firstName: buyer.firstName || "User",
    listingTitle,
    orderId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: buyer.email,
    subject: `Your order has been delivered — ${listingTitle}`,
    html,
  });
};

export const sendOrderRevisionEmail = async (
  sellerId: string,
  listingTitle: string,
  orderId: string
): Promise<boolean> => {
  const seller = await User.findById(sellerId)
    .select("email firstName role companyId")
    .populate("companyId", "name")
    .lean() as any;

  if (!seller?.email) {
    console.error("Seller email not found");
    return false;
  }

  const name =
    seller.role === "corporate"
      ? seller.companyId?.name || "Company"
      : seller.firstName || "Seller";

  const html = loadTemplate("order-revision", {
    name,
    listingTitle,
    orderId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: seller.email,
    subject: `Revision requested — ${listingTitle}`,
    html,
  });
};

export const sendOrderDisputedEmail = async (
  userId: string,
  listingTitle: string,
  orderId: string
): Promise<boolean> => {
  const user = await User.findById(userId)
    .select("email firstName")
    .lean();

  if (!user?.email) {
    console.error("User email not found");
    return false;
  }

  const html = loadTemplate("order-disputed", {
    firstName: user.firstName || "User",
    listingTitle,
    orderId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: user.email,
    subject: `Dispute opened on order — ${listingTitle}`,
    html,
  });
};

export const sendOrderDisputeResolvedEmail = async (
  userId: string,
  listingTitle: string,
  orderId: string,
  outcome: "favour_buyer" | "favour_seller"
): Promise<boolean> => {
  const user = await User.findById(userId)
    .select("email firstName")
    .lean();

  if (!user?.email) {
    console.error("User email not found");
    return false;
  }

  const resultText =
    outcome === "favour_buyer"
      ? "resolved in favour of the buyer"
      : "resolved in favour of the seller";

  const html = loadTemplate("order-dispute-resolved", {
    firstName: user.firstName || "User",
    listingTitle,
    orderId,
    result: resultText,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: user.email,
    subject: `Dispute resolved — ${listingTitle}`,
    html,
  });
};

// ─── Errand senders ───────────────────────────────────────────────────────────

export const sendErrandBidAcceptedEmail = async (
  runnerId: string,
  errandTitle: string,
  errandId: string,
  amount: number,
  escrowReference: string
): Promise<boolean> => {
  const runner = await User.findById(runnerId)
    .select("email firstName")
    .lean();

  if (!runner?.email) {
    console.error("Runner email not found");
    return false;
  }

  const html = loadTemplate("errand-bid-accepted", {
    firstName: runner.firstName || "User",
    errandTitle,
    errandId,
    amount: amount.toLocaleString(),
    escrowReference,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: runner.email,
    subject: `Your bid was accepted — ${errandTitle}`,
    html,
  });
};

export const sendErrandStartedEmail = async (
  posterId: string,
  errandTitle: string,
  errandId: string
): Promise<boolean> => {
  const poster = await User.findById(posterId)
    .select("email firstName")
    .lean();

  if (!poster?.email) {
    console.error("Poster email not found");
    return false;
  }

  const html = loadTemplate("errand-started", {
    firstName: poster.firstName || "User",
    errandTitle,
    errandId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: poster.email,
    subject: `Errand in progress — ${errandTitle}`,
    html,
  });
};

export const sendErrandCompletedEmail = async (
  posterId: string,
  errandTitle: string,
  errandId: string
): Promise<boolean> => {
  const poster = await User.findById(posterId)
    .select("email firstName")
    .lean();

  if (!poster?.email) {
    console.error("Poster email not found");
    return false;
  }

  const html = loadTemplate("errand-completed", {
    firstName: poster.firstName || "User",
    errandTitle,
    errandId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: poster.email,
    subject: `Errand marked complete — ${errandTitle}`,
    html,
  });
};

export const sendErrandConfirmedEmail = async (
  runnerId: string,
  errandTitle: string,
  errandId: string,
  earnings: number
): Promise<boolean> => {
  const runner = await User.findById(runnerId)
    .select("email firstName")
    .lean();

  if (!runner?.email) {
    console.error("Runner email not found");
    return false;
  }

  const html = loadTemplate("errand-confirmed", {
    firstName: runner.firstName || "User",
    errandTitle,
    errandId,
    earnings: earnings.toLocaleString(),
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: runner.email,
    subject: `Errand confirmed — ₦${earnings.toLocaleString()} pending clearance`,
    html,
  });
};

export const sendErrandDisputedEmail = async (
  userId: string,
  errandTitle: string,
  errandId: string
): Promise<boolean> => {
  const user = await User.findById(userId)
    .select("email firstName")
    .lean();

  if (!user?.email) {
    console.error("User email not found");
    return false;
  }

  const html = loadTemplate("errand-disputed", {
    firstName: user.firstName || "User",
    errandTitle,
    errandId,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: user.email,
    subject: `Dispute opened on errand — ${errandTitle}`,
    html,
  });
};

export const sendErrandDisputeResolvedEmail = async (
  userId: string,
  errandTitle: string,
  errandId: string,
  outcome: "favour_poster" | "favour_runner"
): Promise<boolean> => {
  const user = await User.findById(userId)
    .select("email firstName")
    .lean();

  if (!user?.email) {
    console.error("User email not found");
    return false;
  }

  const resultText =
    outcome === "favour_poster"
      ? "resolved in favour of the poster"
      : "resolved in favour of the runner";

  const html = loadTemplate("errand-dispute-resolved", {
    firstName: user.firstName || "User",
    errandTitle,
    errandId,
    result: resultText,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: user.email,
    subject: `Dispute resolved — ${errandTitle}`,
    html,
  });
};

export const sendOrderCancelledBySellerEmail = async (
  buyerId: string,
  listingTitle: string,
  orderId: string,
  reason: string,
): Promise<boolean> => {
  const buyer = await User.findById(buyerId)
    .select("email firstName")
    .lean();

  if (!buyer?.email) {
    console.error("Buyer email not found");
    return false;
  }

  const html = loadTemplate("order-cancelled-by-seller", {
    firstName: buyer.firstName || "User",
    listingTitle,
    orderId,
    reason,
    appName: APP_NAME,
    clientUrl: CLIENT_URL,
  });

  return sendEmail({
    to: buyer.email,
    subject: `Your order has been cancelled — ${listingTitle}`,
    html,
  });
};


export const sendSupportTicketCreatedEmail = async (
    userId: string,
    ticketNumber: string,
    ticketId: string,
    category: string,
    type: string,
    description: string,
    priority: string,
): Promise<boolean> => {
    const user = await User.findById(userId).select('email firstName').lean()
    if (!user?.email) return false

    const html = loadTemplate('support-ticket-created', {
        firstName:    user.firstName || 'User',
        ticketNumber,
        ticketId,
        category,
        type,
        description:  description.length > 300 ? description.slice(0, 300) + '...' : description,
        priority,
        appName:      APP_NAME,
        clientUrl:    CLIENT_URL,
    })

    return sendEmail({
        to:      user.email,
        subject: `Support ticket received — #${ticketNumber} | ${APP_NAME}`,
        html,
    })
}

export const sendSupportTicketUpdatedEmail = async (
    userId: string,
    ticketNumber: string,
    ticketId: string,
    category: string,
    type: string,
    status: string,
    adminNote: string,
): Promise<boolean> => {
    const user = await User.findById(userId).select('email firstName').lean()
    if (!user?.email) return false

    const adminNoteBlock = adminNote
        ? `<p style="margin:0 0 8px;font-weight:bold;color:#111827;">Note from our team:</p>
           <div style="background:#f0fff4;border-left:4px solid #2f855a;padding:14px 18px;border-radius:4px;margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
             ${adminNote}
           </div>`
        : ''

    const html = loadTemplate('support-ticket-updated', {
        firstName:     user.firstName || 'User',
        ticketNumber,
        ticketId,
        category,
        type,
        statusLabel:   STATUS_LABELS[status] ?? status,
        adminNoteBlock,
        appName:       APP_NAME,
        clientUrl:     CLIENT_URL,
    })

    return sendEmail({
        to:      user.email,
        subject: `Ticket #${ticketNumber} update — ${STATUS_LABELS[status] ?? status} | ${APP_NAME}`,
        html,
    })
}

export default sendEmail;