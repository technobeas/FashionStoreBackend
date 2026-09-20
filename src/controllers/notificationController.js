import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import Product from "../models/Product.js";
import Collection from "../models/Collection.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import { deliverNotification } from "../services/notificationService.js";

function tenantDestination(url, tenant) {
  const raw = String(url || "/").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = `/shop/${tenant.slug}`;
  if (!raw || raw === "/") return base;
  if (raw.startsWith(base)) return raw;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function parseSchedule(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Invalid scheduled time.");
    error.statusCode = 400;
    throw error;
  }
  return date;
}

export async function list(req, res) {
  const pageNum = Math.max(Number(req.query.page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { tenantId: req.tenant._id };

  if (["draft", "scheduled", "sending", "sent", "partial", "failed", "cancelled"].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .populate("product", "name slug")
      .populate("collection", "name slug")
      .sort("-createdAt")
      .skip((pageNum - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter)
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
  });
}

export async function create(req, res) {
  const {
    title,
    message,
    image = "",
    product = null,
    collection = null,
    url = "/",
    scheduledFor = null,
    kind = "general"
  } = req.body;

  if (!title?.trim() || !message?.trim()) {
    return res.status(400).json({ message: "Title and message are required." });
  }

  if (product && !mongoose.isValidObjectId(product)) {
    return res.status(400).json({ message: "Invalid product." });
  }
  if (collection && !mongoose.isValidObjectId(collection)) {
    return res.status(400).json({ message: "Invalid collection." });
  }

  if (product) {
    const ownedProduct = await Product.exists({ _id: product, tenantId: req.tenant._id });
    if (!ownedProduct) return res.status(404).json({ message: "Product not found." });
  }

  if (collection) {
    const ownedCollection = await Collection.exists({ _id: collection, tenantId: req.tenant._id });
    if (!ownedCollection) return res.status(404).json({ message: "Collection not found." });
  }

  const allowedKinds = ["general", "promotion", "low_stock", "offer", "new_arrival"];
  if (!allowedKinds.includes(kind)) return res.status(400).json({ message: "Invalid notification type." });

  const schedule = parseSchedule(scheduledFor);
  const status = schedule && schedule.getTime() > Date.now() ? "scheduled" : "draft";

  const n = await Notification.create({
    tenantId: req.tenant._id,
    createdBy: req.admin?._id || null,
    title: title.trim(),
    message: message.trim(),
    image,
    product,
    collection,
    url: tenantDestination(url, req.tenant),
    scheduledFor: schedule,
    nextAttemptAt: status === "scheduled" ? schedule : null,
    kind,
    status
  });

  res.status(201).json(n);
}

export async function send(req, res) {
  const n = await Notification.findOne({
    _id: req.params.id,
    tenantId: req.tenant._id
  });

  if (!n) return res.status(404).json({ message: "Notification not found" });
  if (n.status === "sent" || n.status === "sending") {
    return res.status(409).json({ message: "Notification is already being or has been sent." });
  }
  if (n.status === "cancelled") {
    return res.status(409).json({ message: "Cancelled notifications cannot be sent." });
  }

  n.attempts += 1;
  try {
    const delivered = await deliverNotification(n);
    res.json(delivered);
  } catch (error) {
    throw error;
  }
}

export async function cancel(req, res) {
  const n = await Notification.findOne({
    _id: req.params.id,
    tenantId: req.tenant._id
  });

  if (!n) return res.status(404).json({ message: "Notification not found" });
  if (!["draft", "scheduled", "failed"].includes(n.status)) {
    return res.status(409).json({ message: "Only draft, scheduled, or failed notifications can be cancelled." });
  }

  n.status = "cancelled";
  n.nextAttemptAt = null;
  n.processingStartedAt = null;
  await n.save();

  res.json(n);
}



export async function deliveries(req, res) {
  const pageNum = Math.max(Number(req.query.page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  const notification = await Notification.exists({
    _id: req.params.id,
    tenantId: req.tenant._id
  });
  if (!notification) return res.status(404).json({ message: "Notification not found" });

  const filter = { tenantId: req.tenant._id, notificationId: req.params.id };
  const [items, total] = await Promise.all([
    NotificationDelivery.find(filter)
      .sort("-updatedAt")
      .skip((pageNum - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    NotificationDelivery.countDocuments(filter)
  ]);

  res.json({
    items,
    pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
  });
}
