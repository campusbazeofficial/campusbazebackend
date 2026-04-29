import cron from "node-cron";
import Subscription from "../models/subscription.model.js";
import { SubscriptionService } from "../services/subscription.service.js";
import { SUBSCRIPTION_STATUS } from "../utils/constant.js";

const subscriptionService = new SubscriptionService();

// ─── Schedule ─────────────────────────────────────────────────────────────────
// Production : every 30 minutes — enough precision for daily/monthly billing
// Test/Dev   : every 1 minute — so a 1-hour subscription renews promptly

const CRON_SCHEDULE = process.env.NODE_ENV === "production"
  ? "*/30 * * * *"     // every 30 minutes
  : "* * * * *";       // every 1 minute

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runRenewalCycle(): Promise<void> {
  const now = new Date();

  const due = await Subscription.find({
    status:          SUBSCRIPTION_STATUS.ACTIVE,
    autoRenew:       true,
    nextBillingDate: { $lte: now },
  })
    .select("_id userId tier billingPeriod")
    .lean();

  if (due.length === 0) return;

  console.log(`[SubscriptionCron] ${due.length} subscription(s) due for renewal`);

  for (const sub of due) {
    try {
      await subscriptionService.renewSubscription(sub._id.toString());
      console.log(
        `[SubscriptionCron] ✅ Renewed ${sub._id} — user ${sub.userId} (${sub.tier} ${sub.billingPeriod})`
      );
    } catch (err) {
      console.error(
        `[SubscriptionCron] ❌ Failed to renew ${sub._id} — user ${sub.userId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const startSubscriptionCron = (): void => {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await runRenewalCycle();
    } catch (err) {
      console.error("[SubscriptionCron] Unhandled error in renewal cycle:", err);
    }
  });

  const env = process.env.NODE_ENV ?? "development";
  console.log(
    `🔄 Subscription renewal cron started [${env}] — schedule: "${CRON_SCHEDULE}"`
  );
};