import Campaign from "../models/Campaign.js";
import Customer from "../models/Customer.js";
import PushSubscription from "../models/PushSubscription.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import webpush from "../config/push.js";
import { adjustPoints } from "./loyaltyService.js";

function audienceFilter(audience = {}) {
  const f = {};
  if (audience.loyaltyTier) f.loyaltyTier = audience.loyaltyTier;
  if (audience.tag) f.tags = audience.tag;
  if (Number.isFinite(Number(audience.minSpend))) f.totalSpent = { ...(f.totalSpent || {}), $gte: Number(audience.minSpend) };
  if (audience.maxSpend !== null && audience.maxSpend !== "" && Number.isFinite(Number(audience.maxSpend))) f.totalSpent = { ...(f.totalSpent || {}), $lte: Number(audience.maxSpend) };
  if (audience.segment && audience.segment !== "all") f.crmSegment = audience.segment;
  return f;
}

async function targetSubscriptions(tenantId, audience) {
  const customers = await Customer.find({ tenantId, ...audienceFilter(audience) }).select("_id").lean();
  if (!customers.length && audience.segment !== "all") return [];
  const customerIds = customers.map(c => c._id);
  const filter = { tenantId };
  if (audience.segment !== "all" || audience.loyaltyTier || audience.tag || audience.minSpend || audience.maxSpend) {
    filter.customerId = { $in: customerIds };
  }
  return PushSubscription.find(filter).lean();
}

export async function sendCampaign(campaign) {
  campaign.status = "sending";
  campaign.attempts += 1;
  campaign.lastError = "";
  await campaign.save();

  try {
    const subscriptions = await targetSubscriptions(campaign.tenantId, campaign.audience || {});
    const payload = JSON.stringify({
      title: campaign.title,
      body: campaign.message,
      data: { url: campaign.url || "/", campaignId: String(campaign._id) }
    });
    const now = new Date();
    let successCount = 0, failureCount = 0;
    const ops = [];
    const invalid = [];

    const results = await Promise.allSettled(subscriptions.map(s => webpush.sendNotification(s, payload)));
    results.forEach((r, i) => {
      const sub = subscriptions[i];
      if (r.status === "fulfilled") {
        successCount++;
        ops.push({ updateOne: { filter: { tenantId: campaign.tenantId, notificationId: campaign.notificationId, endpoint: sub.endpoint }, update: { $set: { campaignId: campaign._id, status: "success", sentAt: now, errorCode: null, errorMessage: "" } }, upsert: true } });
      } else {
        failureCount++;
        const code = Number(r.reason?.statusCode) || null;
        if (code === 404 || code === 410) invalid.push(sub.endpoint);
        ops.push({ updateOne: { filter: { tenantId: campaign.tenantId, notificationId: campaign.notificationId, endpoint: sub.endpoint }, update: { $set: { campaignId: campaign._id, status: "failed", sentAt: null, errorCode: code, errorMessage: String(r.reason?.message || "Push delivery failed").slice(0, 500) } }, upsert: true } });
      }
    });
    if (ops.length) await NotificationDelivery.bulkWrite(ops, { ordered: false });
    if (invalid.length) await PushSubscription.deleteMany({ tenantId: campaign.tenantId, endpoint: { $in: invalid } });

    campaign.recipientCount = subscriptions.length;
    campaign.successCount = successCount;
    campaign.failureCount = failureCount;
    campaign.status = failureCount ? (successCount ? "partial" : "failed") : "sent";
    campaign.sentAt = now;
    campaign.scheduledFor = null;
    await campaign.save();
    return campaign;
  } catch (e) {
    campaign.lastError = String(e?.message || "Campaign delivery failed").slice(0, 500);
    campaign.status = campaign.attempts < 3 ? "scheduled" : "failed";
    if (campaign.status === "scheduled") campaign.scheduledFor = new Date(Date.now() + Math.min(15 * 60 * 1000, 30000 * 2 ** campaign.attempts));
    await campaign.save();
    throw e;
  }
}

export async function processScheduledCampaigns() {
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const campaign = await Campaign.findOneAndUpdate(
      { status: "scheduled", scheduledFor: { $lte: now }, attempts: { $lt: 3 } },
      { $set: { status: "sending" }, $inc: { attempts: 1 } },
      { sort: { scheduledFor: 1 }, new: true }
    );
    if (!campaign) break;
    try { await sendCampaign(campaign); } catch {}
  }
}

export async function rewardReferral({ referral, referrerPoints, referredPoints, orderId, createdBy = null }) {
  if (referral.status !== "pending") return referral;
  if (referrerPoints > 0) await adjustPoints({ tenantId: referral.tenantId, customerId: referral.referrerCustomerId, points: referrerPoints, note: `Referral reward ${referral.code}`, createdBy });
  if (referredPoints > 0) await adjustPoints({ tenantId: referral.tenantId, customerId: referral.referredCustomerId, points: referredPoints, note: `Referral reward ${referral.code}`, createdBy });
  referral.status = "rewarded";
  referral.qualifyingOrderId = orderId;
  referral.referrerRewardPoints = referrerPoints;
  referral.referredRewardPoints = referredPoints;
  referral.rewardedAt = new Date();
  await referral.save();
  return referral;
}
