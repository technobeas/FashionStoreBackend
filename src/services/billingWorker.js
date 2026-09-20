import Subscription from "../models/Subscription.js";
import Invoice from "../models/Invoice.js";
import { getPlan, createInvoice, syncTenantSubscription } from "./billingService.js";

let timer = null;
let running = false;

export async function processBillingCycles() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await Subscription.find({ currentPeriodEnd: { $lte: now }, status: { $in: ["active", "past_due"] } }).limit(100);
    for (const subscription of due) {
      const currentInvoice = await Invoice.findOne({ subscriptionId: subscription._id, periodEnd: subscription.currentPeriodEnd }).sort({ createdAt: -1 });
      if (currentInvoice && currentInvoice.status !== "paid" && currentInvoice.total > 0) {
        subscription.status = "past_due";
        subscription.failedPaymentCount += 1;
        subscription.graceEndsAt = subscription.graceEndsAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await subscription.save();
        await syncTenantSubscription(subscription.tenantId, subscription);
        continue;
      }

      let nextPlanCode = subscription.pendingPlanCode || subscription.planCode;
      let nextCycle = subscription.pendingBillingCycle || subscription.billingCycle;
      const plan = await getPlan(nextPlanCode);
      if (!plan) continue;
      const start = new Date(subscription.currentPeriodEnd || now);
      const end = new Date(start);
      if (nextCycle === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
      else end.setUTCMonth(end.getUTCMonth() + 1);
      subscription.planCode = nextPlanCode;
      subscription.billingCycle = nextCycle;
      subscription.pendingPlanCode = null;
      subscription.pendingBillingCycle = null;
      subscription.currentPeriodStart = start;
      subscription.currentPeriodEnd = end;
      subscription.status = subscription.cancelAtPeriodEnd ? "cancelled" : "active";
      if (subscription.cancelAtPeriodEnd) subscription.cancelledAt = now;
      await subscription.save();
      if (subscription.status === "active") await createInvoice({ tenantId: subscription.tenantId, subscription, plan, cycle: nextCycle, periodStart: start, periodEnd: end });
      await syncTenantSubscription(subscription.tenantId, subscription);
    }
  } finally { running = false; }
}

export function startBillingWorker(intervalMs = 15 * 60 * 1000) {
  if (timer) return;
  const interval = Number(intervalMs) > 0 ? Number(intervalMs) : 15 * 60 * 1000;
  processBillingCycles().catch(error => console.error("Billing worker failed:", error.message));
  timer = setInterval(() => processBillingCycles().catch(error => console.error("Billing worker failed:", error.message)), interval);
}

export function stopBillingWorker() { if (timer) clearInterval(timer); timer = null; }
