
import mongoose from "mongoose";
import { create as createPosOrder } from "./orderController.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";
import crypto from "node:crypto";

const RETURN_POLICY = "Online orders are not eligible for returns. Please visit the store for assistance.";

function clean(v, max = 300) {
  return String(v ?? "").trim().slice(0, max);
}

function captureResponse() {
  const state = { statusCode: 200, payload: null };
  return {
    status(code) { state.statusCode = code; return this; },
    json(body) { state.payload = body; return body; },
    getState() { return state; }
  };
}

function validEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizePublicOrder(order) {
  if (!order) return null;
  return {
    id: order._id,
    publicTrackingToken: order.publicTrackingToken || "",
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    source: order.source,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    contact: order.contact,
    items: order.items,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    finalTotal: order.finalTotal,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    delivery: order.delivery,
    deliveryTracking: order.deliveryTracking,
    returnPolicy: order.returnPolicy
  };
}

async function calculateCartTotal(tenantId, items = []) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error("Add at least one product to the cart."), { status: 400 });
  const normalized = [];
  for (const raw of items) {
    const productId = String(raw.product || "");
    const variantId = raw.variant ? String(raw.variant) : "";
    const quantity = Math.floor(Number(raw.quantity));
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
      throw Object.assign(new Error("Each order item must have a valid product and quantity."), { status: 400 });
    }
    if (variantId && !mongoose.isValidObjectId(variantId)) {
      throw Object.assign(new Error("Invalid product variant."), { status: 400 });
    }
    normalized.push({ productId, variantId, quantity });
  }
  const products = await Product.find({ tenantId, _id: { $in: normalized.map(x => x.productId) } }).select("name variantEnabled isAvailable sellingPrice discountedPrice").lean();
  const productMap = new Map(products.map(p => [String(p._id), p]));
  const variantIds = normalized.filter(x => x.variantId).map(x => x.variantId);
  const variants = variantIds.length ? await ProductVariant.find({ tenantId, _id: { $in: variantIds } }).select("productId isAvailable stockQuantity sellingPrice discountedPrice").lean() : [];
  const variantMap = new Map(variants.map(v => [String(v._id), v]));
  let total = 0;
  for (const item of normalized) {
    const product = productMap.get(item.productId);
    if (!product || !product.isAvailable) throw Object.assign(new Error("One of the selected products is no longer available."), { status: 409 });
    let source = product;
    if (product.variantEnabled) {
      const variant = variantMap.get(item.variantId);
      if (!variant || String(variant.productId) !== String(product._id) || !variant.isAvailable || Number(variant.stockQuantity) < item.quantity) {
        throw Object.assign(new Error(`${product.name} is no longer available in the selected variant/quantity.`), { status: 409 });
      }
      source = variant;
    }
    const price = source.discountedPrice != null ? Number(source.discountedPrice) : Number(source.sellingPrice || 0);
    total += price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

function onlineOrderNumber() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `NC-ONL-${stamp}-${random}`;
}

export async function createOnlineOrder(req, res, next) {
  try {
    const body = req.body || {};
    const name = clean(body.customerName, 120);
    const phone = clean(body.customerPhone, 30);
    const email = clean(body.email, 160).toLowerCase();
    const accepted = body.acceptedTerms === true || body.acceptedTerms === "true";
    const delivery = {
      addressLine1: clean(body.delivery?.addressLine1, 250),
      addressLine2: clean(body.delivery?.addressLine2, 250),
      landmark: clean(body.delivery?.landmark, 160),
      city: clean(body.delivery?.city, 100),
      state: clean(body.delivery?.state, 100),
      postalCode: clean(body.delivery?.postalCode, 20),
      country: clean(body.delivery?.country || "India", 80),
      instructions: clean(body.delivery?.instructions, 500)
    };

    if (name.length < 2) return res.status(400).json({ message: "Customer name is required." });
    if (phone.length < 5) return res.status(400).json({ message: "Customer phone is required." });
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (!delivery.addressLine1 || !delivery.city || !delivery.state || !delivery.postalCode) {
      return res.status(400).json({ message: "Complete the delivery address before placing the order." });
    }
    if (!accepted) {
      return res.status(400).json({ message: "You must accept the Terms, Privacy Policy and online no-return policy before placing the order." });
    }

    const idempotencyKey = clean(body.idempotencyKey, 120);
    if (idempotencyKey) {
      const existing = await Order.findOne({ tenantId: req.tenant._id, idempotencyKey }).lean();
      if (existing) return res.status(200).json({ order: sanitizePublicOrder(existing) });
    }

    const paymentChoice = String(body.paymentMethod || "COD").toUpperCase() === "ONLINE" ? "Online Payment" : "Cash on Delivery";
    const serverTotal = await calculateCartTotal(req.tenant._id, body.items);

    // Reuse the established POS sale path so variant validation, stock deduction,
    // inventory ledger entries, pricing snapshots and loyalty remain identical.
    const syntheticReq = {
      ...req,
      body: {
        ...body,
        customerId: null,
        customerName: name,
        customerPhone: phone,
        finalTotal: serverTotal,
        paymentMethod: "Credit",
        payments: [{ method: "Credit", amount: 0, note: "Online order payment pending" }],
        idempotencyKey,
        notes: clean(body.notes, 500),
        skipLoyalty: true
      }
    };
    const capture = captureResponse();
    await createPosOrder(syntheticReq, capture);
    const result = capture.getState();
    if (result.statusCode >= 400) return res.status(result.statusCode).json(result.payload);

    const created = result.payload;
    if (!created?._id) return res.status(500).json({ message: "Could not create online order." });

    const order = await Order.findOne({ _id: created._id, tenantId: req.tenant._id });
    if (!order) return res.status(500).json({ message: "Online order was created but could not be loaded." });

    const acceptedAt = new Date();
    const customer = await Customer.findOneAndUpdate(
      { tenantId: req.tenant._id, phone },
      {
        $set: {
          name,
          email,
          address: [delivery.addressLine1, delivery.addressLine2, delivery.city, delivery.state, delivery.postalCode].filter(Boolean).join(", "),
          onlineConsent: {
            accepted: true,
            acceptedAt,
            termsVersion: "v1",
            privacyVersion: "v1",
            returnPolicyVersion: "online-no-return-v1",
            ip: clean(req.ip, 100)
          }
        },
        $setOnInsert: { tenantId: req.tenant._id, phone }
      },
      { new: true, upsert: true }
    );

    order.customerId = customer._id;
    order.customerName = name;
    order.customerPhone = phone;
    order.orderNumber = onlineOrderNumber();
    order.source = "ONLINE";
    order.fulfillmentStatus = "pending";
    order.paymentMethod = "Credit";
    order.paymentStatus = "pending";
    order.paidAmount = 0;
    order.dueAmount = order.finalTotal;
    order.payments = [];
    order.delivery = delivery;
    order.contact = { email, whatsapp: clean(body.whatsapp || phone, 30) };
    order.publicTrackingToken = crypto.randomBytes(24).toString("hex");
    order.deliveryTracking = { trackingId: "", courierName: "", trackingUrl: "", updatedAt: null };
    order.onlineConsent = {
      accepted: true,
      acceptedAt,
      termsVersion: "v1",
      privacyVersion: "v1",
      returnPolicyVersion: "online-no-return-v1",
      ip: clean(req.ip, 100),
      userAgent: clean(req.get("user-agent"), 500)
    };
    order.returnPolicy = { eligible: false, snapshot: RETURN_POLICY };
    await order.save();

    res.status(201).json({
      order: sanitizePublicOrder(order.toObject()),
      message: "Order placed successfully."
    });
  } catch (error) {
    next(error);
  }
}

export async function createAdminOnlineOrder(req, res, next) {
  try {
    req.body = {
      ...(req.body || {}),
      acceptedTerms: true,
      paymentMethod: "COD",
      whatsapp: req.body?.whatsapp || req.body?.customerPhone
    };
    return createOnlineOrder(req, res, next);
  } catch (error) {
    next(error);
  }
}

export async function trackOrder(req, res) {
  const token = clean(req.body?.token || req.query?.token, 120);
  const identifier = clean(req.body?.orderNumber || req.body?.trackingId || req.query?.orderNumber || req.query?.trackingId, 120);
  const phone = clean(req.body?.phone || req.query?.phone, 30);

  if (!token && !identifier) return res.status(400).json({ message: "Enter your order ID, tracking ID or tracking link." });
  if (!token && phone.length < 5) return res.status(400).json({ message: "Enter the phone number used for the order." });

  const filter = token
    ? { source: "ONLINE", tenantId: req.tenant._id, publicTrackingToken: token }
    : { source: "ONLINE", tenantId: req.tenant._id, customerPhone: phone, $or: [
      { orderNumber: identifier },
      { "deliveryTracking.trackingId": identifier }
    ] };

  const order = await Order.findOne(filter).lean();
  if (!order) return res.status(404).json({ message: "Order not found. Check the order ID/tracking ID and phone number." });
  res.json({ order: sanitizePublicOrder(order) });
}

export async function myOrders(req, res) {
  const orderNumber = clean(req.body?.orderNumber || req.query?.orderNumber, 120);
  if (!orderNumber) return res.status(400).json({ message: "Enter your Order ID." });
  const safe = orderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const orders = await Order.find({ tenantId: req.tenant._id, source: "ONLINE", orderNumber: new RegExp(safe, "i") })
    .sort("-createdAt").limit(50).lean();
  res.json({ orders: orders.map(sanitizePublicOrder) });
}

export async function adminOnlineList(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const q = clean(req.query.q, 100);
  const filter = { tenantId: req.tenant._id, source: "ONLINE" };
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { orderNumber: new RegExp(safe, "i") },
      { customerName: new RegExp(safe, "i") },
      { customerPhone: new RegExp(safe, "i") },
      { "deliveryTracking.trackingId": new RegExp(safe, "i") }
    ];
  }
  if (req.query.status && ["pending","confirmed","processing","packed","shipped","out_for_delivery","delivered","cancelled"].includes(req.query.status)) {
    filter.fulfillmentStatus = req.query.status;
  }
  if (req.query.all !== "1") {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (!Number.isNaN(from.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $gte: from };
    if (!Number.isNaN(to.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lte: to };
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort("-createdAt").skip((page-1)*limit).limit(limit).lean(),
    Order.countDocuments(filter)
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
}

const STATUS_FLOW = ["pending","confirmed","processing","packed","shipped","out_for_delivery","delivered"];

async function restoreCancelledStock(order, tenantId, adminId) {
  for (const item of order.items || []) {
    const qty = Number(item.quantity || 0);
    if (qty < 1) continue;
    if (item.variant) {
      const variant = await ProductVariant.findOneAndUpdate(
        { tenantId, _id: item.variant, productId: item.product },
        { $inc: { stockQuantity: qty }, $set: { isAvailable: true } },
        { new: true }
      );
      if (variant) {
        await Product.updateOne({ tenantId, _id: item.product }, { $inc: { stockQuantity: qty }, $set: { isAvailable: true } });
        await recordInventoryTransaction({
          tenantId, product: item.product, variant: item.variant, productName: item.name, sku: variant.sku || item.sku,
          type: "ADJUSTMENT", quantityBefore: Number(variant.stockQuantity) - qty, quantityChange: qty, quantityAfter: Number(variant.stockQuantity),
          referenceType: "Order", referenceId: order._id, note: `Cancelled online order ${order.orderNumber}`, createdBy: adminId
        });
      }
    } else {
      const product = await Product.findOneAndUpdate(
        { tenantId, _id: item.product },
        { $inc: { stockQuantity: qty }, $set: { isAvailable: true } },
        { new: true }
      );
      if (product) {
        await recordInventoryTransaction({
          tenantId, product: item.product, productName: item.name, sku: product.sku || item.sku,
          type: "ADJUSTMENT", quantityBefore: Number(product.stockQuantity) - qty, quantityChange: qty, quantityAfter: Number(product.stockQuantity),
          referenceType: "Order", referenceId: order._id, note: `Cancelled online order ${order.orderNumber}`, createdBy: adminId
        });
      }
    }
  }
}

export async function updateOnlineOrder(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant._id, source: "ONLINE" });
    if (!order) return res.status(404).json({ message: "Online order not found." });

    const requestedStatus = clean(req.body?.fulfillmentStatus, 40);
    const trackingId = clean(req.body?.trackingId, 120);
    const courierName = clean(req.body?.courierName, 120);
    const trackingUrl = clean(req.body?.trackingUrl, 500);
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return res.status(400).json({ message: "Tracking URL must be an external http(s) courier link." });
    const adminNote = clean(req.body?.adminNote, 500);

    if (requestedStatus && requestedStatus !== "cancelled" && !STATUS_FLOW.includes(requestedStatus)) {
      return res.status(400).json({ message: "Invalid delivery status." });
    }

    if (requestedStatus === "cancelled" && order.fulfillmentStatus !== "cancelled") {
      await restoreCancelledStock(order, req.tenant._id, req.admin?._id || null);
      order.status = "cancelled";
      order.fulfillmentStatus = "cancelled";
      const paid = Number(order.paidAmount || 0);
      if (paid > 0) {
        order.refundedAmount = paid;
        order.paymentStatus = "refunded";
        order.dueAmount = 0;
        order.refund = { amount: paid, status: "refunded", processedAt: new Date(), note: adminNote || "Online order cancelled; payment reversed." };
      }
      order.notes = [order.notes, adminNote, paid > 0 ? `Payment reversal recorded: ₹${paid.toFixed(2)}` : "No payment had been collected."] .filter(Boolean).join("\n");
    } else if (requestedStatus) {
      order.fulfillmentStatus = requestedStatus;
      if (requestedStatus === "delivered" && order.paymentStatus === "pending" && order.paymentMethod === "Cash on Delivery") {
        // COD remains payable until staff records the actual payment.
      }
      order.notes = [order.notes, adminNote].filter(Boolean).join("\n");
    } else if (adminNote) {
      order.notes = [order.notes, adminNote].filter(Boolean).join("\n");
    }

    if (trackingId || courierName || trackingUrl) {
      order.deliveryTracking = { trackingId, courierName, trackingUrl, updatedAt: new Date() };
      if (trackingId) {
        order.fulfillmentStatus = "shipped";
      }
    }
    // Once a courier tracking ID exists, courier tracking becomes the source of
    // delivery progress; staff do not need to manually advance fulfillment status.
    if (order.deliveryTracking?.trackingId && requestedStatus && requestedStatus !== "cancelled") {
      order.fulfillmentStatus = "shipped";
    }
    await order.save();
    res.json(order);
  } catch (error) {
    next(error);
  }
}
