import PushSubscription from "../models/PushSubscription.js";
import { env } from "../config/env.js";

export function publicKey(req, res) {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY });
}

export async function subscribe(req, res) {
  const { endpoint, expirationTime, keys, customerId } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ message: "Invalid push subscription" });
  let safeCustomerId = null;
  if (customerId) {
    const Customer = (await import("../models/Customer.js")).default;
    const customer = await Customer.findOne({ _id: customerId, tenantId: req.tenant._id }).select("_id");
    if (!customer) return res.status(400).json({ message: "Invalid customer." });
    safeCustomerId = customer._id;
  }
  const doc = await PushSubscription.findOneAndUpdate(
    { tenantId: req.tenant._id, endpoint },
    { $set: { tenantId: req.tenant._id, customerId: safeCustomerId, endpoint, expirationTime: expirationTime ? new Date(expirationTime) : null, keys, lastSeenAt: new Date() }, $setOnInsert: { subscribedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ id: doc._id });
}

export async function unsubscribe(req, res) {
  await PushSubscription.deleteOne({ tenantId: req.tenant._id, endpoint: req.body.endpoint });
  res.json({ message: "Unsubscribed" });
}

export async function status(req, res) {
  const endpoint = String(req.query.endpoint || "").trim();
  if (!endpoint) return res.json({ registered: false });
  const doc = await PushSubscription.findOne({ tenantId: req.tenant._id, endpoint }).select("_id lastSeenAt expirationTime").lean();
  res.json({ registered: Boolean(doc), lastSeenAt: doc?.lastSeenAt || null, expirationTime: doc?.expirationTime || null });
}
