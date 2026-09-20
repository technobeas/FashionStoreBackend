import Subscription from "../models/Subscription.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import BillingEvent from "../models/BillingEvent.js";
import Tenant from "../models/Tenant.js";
import { ensureSubscription, getPlan, subscribeTenant, changePlan, cancelSubscription, reactivateSubscription, recordPayment } from "../services/billingService.js";
import { getPaymentProvider } from "../services/paymentProvider.js";
import { getEffectivePlanFeatures } from "../middleware/planLimits.js";

function publicSubscription(sub) {
  if (!sub) return null;
  return {
    id: sub._id,
    tenantId: sub.tenantId,
    planCode: sub.planCode,
    billingCycle: sub.billingCycle,
    status: sub.status,
    provider: sub.provider,
    startedAt: sub.startedAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEndsAt: sub.trialEndsAt,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    cancelledAt: sub.cancelledAt,
    graceEndsAt: sub.graceEndsAt,
    pendingPlanCode: sub.pendingPlanCode,
    pendingBillingCycle: sub.pendingBillingCycle,
    failedPaymentCount: sub.failedPaymentCount
  };
}

export async function plans(req, res) {
  const rows = await (await import("../models/SaaSPlan.js")).default.find({ active: true }).sort({ sortOrder: 1, monthlyPrice: 1 }).lean();
  res.json({ plans: rows });
}

export async function overview(req, res) {
  const subscription = await ensureSubscription(req.tenant._id);
  const plan = await getPlan(subscription.planCode);
  const { features } = await getEffectivePlanFeatures(req.tenant);
  const invoices = await Invoice.find({ tenantId: req.tenant._id }).sort({ createdAt: -1 }).limit(12).lean();
  const payments = await Payment.find({ tenantId: req.tenant._id }).sort({ createdAt: -1 }).limit(12).lean();
  res.json({ subscription: publicSubscription(subscription), plan: plan ? { ...plan, features } : plan, invoices, payments, developerBranding: req.tenant.developerBranding || null });
}

export async function subscribe(req, res) {
  try {
    const result = await subscribeTenant({ tenantId: req.tenant._id, planCode: req.body.planCode, billingCycle: req.body.billingCycle });
    res.status(201).json({ message: "Subscription created.", ...result, subscription: publicSubscription(result.subscription) });
  } catch (error) { res.status(400).json({ message: error.message }); }
}

export async function updatePlan(req, res) {
  try {
    const result = await changePlan({ tenantId: req.tenant._id, planCode: req.body.planCode, billingCycle: req.body.billingCycle });
    res.json({ message: result.effective === "immediate" ? "Subscription updated." : "Plan change scheduled for the next billing period.", ...result, subscription: publicSubscription(result.subscription) });
  } catch (error) { res.status(400).json({ message: error.message }); }
}

export async function cancel(req, res) {
  try {
    const subscription = await cancelSubscription({ tenantId: req.tenant._id, immediate: Boolean(req.body.immediate) });
    res.json({ message: subscription.cancelAtPeriodEnd ? "Subscription will cancel at the end of the current period." : "Subscription cancelled.", subscription: publicSubscription(subscription) });
  } catch (error) { res.status(400).json({ message: error.message }); }
}

export async function reactivate(req, res) {
  try {
    const subscription = await reactivateSubscription({ tenantId: req.tenant._id });
    res.json({ message: "Subscription reactivated.", subscription: publicSubscription(subscription) });
  } catch (error) { res.status(400).json({ message: error.message }); }
}

export async function invoices(req, res) {
  const rows = await Invoice.find({ tenantId: req.tenant._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ invoices: rows });
}

export async function payInvoice(req, res) {
  try {
    const result = await recordPayment({ tenantId: req.tenant._id, invoiceId: req.params.id, method: req.body.method || "manual" });
    res.json({ message: "Invoice marked as paid.", ...result });
  } catch (error) { res.status(400).json({ message: error.message }); }
}

export async function webhook(req, res) {
  const providerName = String(req.params.provider || "manual").toLowerCase();
  let provider;
  try { provider = getPaymentProvider(providerName); } catch (error) { return res.status(400).json({ message: error.message }); }
  try {
    await provider.verifyWebhook(req);
    const eventId = String(req.headers["x-billing-event-id"] || req.body?.id || "").trim();
    const eventType = String(req.body?.type || "unknown");
    if (!eventId) return res.status(400).json({ message: "Webhook event id is required." });
    const existing = await BillingEvent.findOne({ provider: providerName, eventId });
    if (existing?.processedAt) return res.json({ received: true, duplicate: true });
    const event = existing || await BillingEvent.create({ provider: providerName, eventId, eventType, payload: req.body });
    // Provider-specific event mapping intentionally stays outside controllers.
    event.processedAt = new Date();
    await event.save();
    return res.json({ received: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

// Platform-level read access for Super Admin. No tenant mutation is performed here.
export async function platformBilling(req, res) {
  const rows = await Subscription.find().sort({ updatedAt: -1 }).limit(200).lean();
  const tenantIds = rows.map(x => x.tenantId);
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select("name slug status plan").lean();
  const map = new Map(tenants.map(t => [String(t._id), t]));
  res.json({ subscriptions: rows.map(s => ({ ...publicSubscription(s), tenant: map.get(String(s.tenantId)) || null })) });
}
