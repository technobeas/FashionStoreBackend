import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import Notification from "../models/Notification.js";
import { sendCampaign } from "../services/campaignService.js";

const KINDS = ["promotion","offer","new_arrival","win_back","birthday","anniversary","loyalty","referral"];
const SEGMENTS = ["all","new","returning","loyal","vip","at_risk","inactive"];

function tenantDestination(url, tenant) {
  const raw = String(url || "/").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = `/shop/${tenant.slug}`;
  if (!raw || raw === "/") return base;
  if (raw.startsWith(base)) return raw;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function clean(v, max = 2000) { return String(v ?? "").trim().slice(0, max); }

export async function list(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { tenantId: req.tenant._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.kind && KINDS.includes(req.query.kind)) filter.kind = req.query.kind;
  const [items, total] = await Promise.all([
    Campaign.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(limit).lean(),
    Campaign.countDocuments(filter)
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function create(req, res) {
  const b = req.body || {};
  const name = clean(b.name, 120), title = clean(b.title, 120), message = clean(b.message, 2000);
  if (name.length < 2 || title.length < 2 || message.length < 2) return res.status(400).json({ message: "Campaign name, title and message are required." });
  const audience = b.audience || {};
  const segment = SEGMENTS.includes(audience.segment) ? audience.segment : "all";
  const scheduledFor = b.scheduledFor ? new Date(b.scheduledFor) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return res.status(400).json({ message: "Invalid schedule." });
  const campaign = await Campaign.create({
    tenantId: req.tenant._id, createdBy: req.admin?._id || null, name, title, message,
    url: tenantDestination(clean(b.url || "/", 500), req.tenant), kind: KINDS.includes(b.kind) ? b.kind : "promotion",
    audience: { ...audience, segment },
    scheduledFor,
    status: scheduledFor && scheduledFor.getTime() > Date.now() ? "scheduled" : "draft"
  });
  res.status(201).json(campaign);
}

export async function sendNow(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid campaign." });
  const campaign = await Campaign.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!campaign) return res.status(404).json({ message: "Campaign not found." });
  if (["sending","sent"].includes(campaign.status)) return res.status(409).json({ message: "Campaign is already being sent or has been sent." });
  if (campaign.status === "cancelled") return res.status(409).json({ message: "Cancelled campaigns cannot be sent." });

  let notification = campaign.notificationId ? await Notification.findOne({ _id: campaign.notificationId, tenantId: req.tenant._id }) : null;
  if (!notification) {
    notification = await Notification.create({
      tenantId: req.tenant._id, createdBy: req.admin?._id || null,
      title: campaign.title, message: campaign.message, url: campaign.url || "/",
      kind: "promotion", status: "draft", attempts: 0
    });
    campaign.notificationId = notification._id;
    await campaign.save();
  }
  const result = await sendCampaign(campaign);
  res.json(result);
}

export async function cancel(req, res) {
  const campaign = await Campaign.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!campaign) return res.status(404).json({ message: "Campaign not found." });
  if (!["draft","scheduled","failed"].includes(campaign.status)) return res.status(409).json({ message: "Campaign cannot be cancelled in its current state." });
  campaign.status = "cancelled"; campaign.scheduledFor = null; await campaign.save();
  res.json(campaign);
}

export async function deliveries(req, res) {
  const exists = await Campaign.exists({ _id: req.params.id, tenantId: req.tenant._id });
  if (!exists) return res.status(404).json({ message: "Campaign not found." });
  const NotificationDelivery = (await import("../models/NotificationDelivery.js")).default;
  const items = await NotificationDelivery.find({ tenantId: req.tenant._id, campaignId: req.params.id }).sort("-updatedAt").limit(200).lean();
  res.json({ items });
}
