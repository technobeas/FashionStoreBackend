import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import SaaSPlan from "../models/SaaSPlan.js";
import Subscription from "../models/Subscription.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import { getPaymentProvider } from "./paymentProvider.js";
import { ensureDefaultPlans } from "../utils/seedPlans.js";

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

function addPeriod(date, cycle) {
  const next = new Date(date);
  if (cycle === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function invoiceNumber(tenantId) {
  return `INV-${new Date().toISOString().slice(0,10).replaceAll("-", "")}-${String(tenantId).slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
}

export async function getPlan(code) {
  await ensureDefaultPlans();
  return SaaSPlan.findOne({ code: String(code || "").toLowerCase(), active: true }).lean();
}

export async function ensureSubscription(tenantId) {
  let sub = await Subscription.findOne({ tenantId });
  if (sub) return sub;
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error("Tenant not found.");
  const legacy = tenant.subscription || {};
  sub = await Subscription.create({
    tenantId,
    planCode: legacy.planCode || tenant.plan || "starter",
    status: legacy.status || (tenant.status === "trial" ? "trialing" : "active"),
    startedAt: legacy.startedAt,
    trialEndsAt: legacy.trialEndsAt,
    currentPeriodStart: legacy.currentPeriodStart,
    currentPeriodEnd: legacy.currentPeriodEnd,
    cancelledAt: legacy.cancelledAt,
    metadata: { migratedFromTenantSubscription: true }
  });
  return sub;
}

export async function syncTenantSubscription(tenantId, sub) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return;
  tenant.plan = sub.planCode;
  tenant.subscription = {
    status: sub.status === "grace_period" ? "past_due" : sub.status,
    startedAt: sub.currentPeriodStart || sub.createdAt || null,
    trialEndsAt: sub.trialEndsAt || null,
    currentPeriodStart: sub.currentPeriodStart || null,
    currentPeriodEnd: sub.currentPeriodEnd || null,
    cancelledAt: sub.cancelledAt || null,
    planCode: sub.planCode,
    notes: "Managed by Subscription/Billing engine"
  };
  if (["cancelled", "suspended"].includes(sub.status)) tenant.status = sub.status;
  else if (sub.status === "trialing") tenant.status = "trial";
  else tenant.status = "active";
  await tenant.save();
}

export async function createInvoice({ tenantId, subscription, plan, cycle, periodStart, periodEnd }) {
  const amount = cycle === "yearly" ? Number(plan.yearlyPrice || 0) : Number(plan.monthlyPrice || 0);
  return Invoice.create({
    tenantId,
    subscriptionId: subscription._id,
    invoiceNumber: invoiceNumber(tenantId),
    status: amount > 0 ? "open" : "paid",
    billingCycle: cycle,
    periodStart,
    periodEnd,
    dueAt: amount > 0 ? new Date(Date.now() + 7 * DAY) : new Date(),
    paidAt: amount > 0 ? null : new Date(),
    subtotal: amount,
    total: amount,
    lineItems: [{ description: `${plan.name} ${cycle} subscription`, quantity: 1, unitAmount: amount, amount }]
  });
}

export async function subscribeTenant({ tenantId, planCode, billingCycle = "monthly" }) {
  if (!["monthly", "yearly"].includes(billingCycle)) throw new Error("Invalid billing cycle.");
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new Error("Tenant not found.");
  const plan = await getPlan(planCode);
  if (!plan) throw new Error("Active plan not found.");
  let subscription = await ensureSubscription(tenantId);
  const provider = getPaymentProvider(subscription.provider || "manual");
  if (!subscription.providerCustomerId) {
    const customer = await provider.createCustomer({ tenant });
    subscription.providerCustomerId = customer.id;
  }
  const now = new Date();
  const start = now;
  const end = addPeriod(now, billingCycle);
  const providerSubscription = await provider.createSubscription({ tenant, plan, billingCycle });
  subscription.planCode = plan.code;
  subscription.billingCycle = billingCycle;
  subscription.status = "active";
  subscription.providerSubscriptionId = providerSubscription.id;
  subscription.currentPeriodStart = start;
  subscription.currentPeriodEnd = end;
  subscription.cancelAtPeriodEnd = false;
  subscription.cancelledAt = null;
  subscription.pendingPlanCode = null;
  subscription.pendingBillingCycle = null;
  subscription.failedPaymentCount = 0;
  await subscription.save();
  await syncTenantSubscription(tenantId, subscription);
  const invoice = await createInvoice({ tenantId, subscription, plan, cycle: billingCycle, periodStart: start, periodEnd: end });
  return { subscription, invoice, checkoutUrl: providerSubscription.checkoutUrl || null };
}

export async function changePlan({ tenantId, planCode, billingCycle }) {
  const subscription = await ensureSubscription(tenantId);
  const plan = await getPlan(planCode);
  if (!plan) throw new Error("Active plan not found.");
  const cycle = billingCycle || subscription.billingCycle || "monthly";
  if (!["monthly", "yearly"].includes(cycle)) throw new Error("Invalid billing cycle.");
  const currentPlan = await getPlan(subscription.planCode);
  const currentPrice = currentPlan ? Number(cycle === "yearly" ? currentPlan.yearlyPrice : currentPlan.monthlyPrice) : 0;
  const nextPrice = Number(cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice);
  const provider = getPaymentProvider(subscription.provider || "manual");
  if (nextPrice > currentPrice || !subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) <= new Date()) {
    const result = await provider.changeSubscription({ subscription, plan, billingCycle: cycle });
    subscription.planCode = plan.code;
    subscription.billingCycle = cycle;
    subscription.status = "active";
    subscription.providerSubscriptionId = result.id || subscription.providerSubscriptionId;
    subscription.pendingPlanCode = null;
    subscription.pendingBillingCycle = null;
    await subscription.save();
    await syncTenantSubscription(tenantId, subscription);
    const start = new Date();
    const end = addPeriod(start, cycle);
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    await subscription.save();
    const invoice = await createInvoice({ tenantId, subscription, plan, cycle, periodStart: start, periodEnd: end });
    return { subscription, invoice, effective: "immediate" };
  }
  subscription.pendingPlanCode = plan.code;
  subscription.pendingBillingCycle = cycle;
  await subscription.save();
  return { subscription, invoice: null, effective: "next_period" };
}

export async function cancelSubscription({ tenantId, immediate = false }) {
  const subscription = await ensureSubscription(tenantId);
  if (immediate) {
    const provider = getPaymentProvider(subscription.provider || "manual");
    await provider.cancelSubscription({ subscription });
    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    subscription.cancelAtPeriodEnd = false;
  } else {
    subscription.cancelAtPeriodEnd = true;
  }
  await subscription.save();
  await syncTenantSubscription(tenantId, subscription);
  return subscription;
}

export async function reactivateSubscription({ tenantId }) {
  const subscription = await ensureSubscription(tenantId);
  if (subscription.status === "cancelled" || subscription.status === "expired") throw new Error("Start a new subscription to reactivate an expired subscription.");
  subscription.cancelAtPeriodEnd = false;
  subscription.cancelledAt = null;
  subscription.status = "active";
  await subscription.save();
  await syncTenantSubscription(tenantId, subscription);
  return subscription;
}

export async function recordPayment({ tenantId, invoiceId, method = "manual" }) {
  if (!mongoose.isValidObjectId(invoiceId)) throw new Error("Invalid invoice id.");
  const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") return { invoice, payment: await Payment.findOne({ invoiceId: invoice._id }).sort({ createdAt: -1 }) };
  const subscription = await Subscription.findOne({ _id: invoice.subscriptionId, tenantId });
  if (!subscription) throw new Error("Subscription not found.");
  const payment = await Payment.create({ tenantId, subscriptionId: subscription._id, invoiceId: invoice._id, provider: subscription.provider, amount: invoice.total, currency: invoice.currency, status: "paid", method, paidAt: new Date() });
  invoice.status = "paid";
  invoice.paidAt = new Date();
  await invoice.save();
  subscription.status = "active";
  subscription.failedPaymentCount = 0;
  subscription.graceEndsAt = null;
  await subscription.save();
  await syncTenantSubscription(tenantId, subscription);
  return { invoice, payment };
}
