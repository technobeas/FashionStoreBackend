import mongoose from "mongoose";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Return from "../models/Return.js";
import Customer from "../models/Customer.js";
import ProductVariant from "../models/ProductVariant.js";
import InventoryTransaction from "../models/InventoryTransaction.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";
import { earnPoints, redeemPoints } from "../services/loyaltyService.js";

function moneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

async function nextOrderNumber() {
  const stamp = new Date();
  const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
  const time = `${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}${String(stamp.getSeconds()).padStart(2, "0")}`;
  const random = Math.floor(100 + Math.random() * 900);
  return `JD-${date}-${time}-${random}`;
}

export async function create(req, res) {
  const {
    customerId = null,
    customerName = "",
    customerPhone = "",
    items = [],
    finalTotal,
    paymentMethod = "Cash",
    payments = [],
    idempotencyKey = "",
    notes = "",
    loyaltyPoints = 0,
    skipLoyalty = false
  } = req.body || {};

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Add at least one product to the cart." });
  }

  const requestedLoyaltyPoints = Math.max(0, Math.floor(Number(loyaltyPoints) || 0));
  const safeIdempotencyKey = String(idempotencyKey || "").trim().slice(0, 120);
  if (safeIdempotencyKey) {
    const existing = await Order.findOne({ tenantId: req.tenant._id, idempotencyKey: safeIdempotencyKey }).lean();
    if (existing) return res.status(200).json(existing);
  }

  let customer = null;
  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) return res.status(400).json({ message: "Invalid customer." });
    customer = await Customer.findOne({ _id: customerId, tenantId: req.tenant._id }).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found." });
  } else if (String(customerPhone || "").trim() && String(customerName || "").trim()) {
    // POS convenience: a new named customer is automatically created from the
    // sale, while an existing phone number reuses the existing profile.
    customer = await Customer.findOneAndUpdate(
      { tenantId: req.tenant._id, phone: String(customerPhone).trim() },
      { $setOnInsert: { tenantId: req.tenant._id, name: String(customerName).trim(), phone: String(customerPhone).trim() } },
      { new: true, upsert: true }
    ).lean();
  }

  const normalized = [];
  const seen = new Set();
  for (const raw of items) {
    const productId = String(raw.product || "");
    const variantId = raw.variant ? String(raw.variant) : "";
    const quantity = Math.floor(Number(raw.quantity));
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Each order item must have a valid product and quantity." });
    }
    if (variantId && !mongoose.isValidObjectId(variantId)) {
      return res.status(400).json({ message: "Invalid product variant." });
    }
    const color = String(raw.color || "").trim();
    const size = String(raw.size || "").trim();
    const key = `${productId}|${variantId}|${color}|${size}`;
    if (seen.has(key)) return res.status(400).json({ message: "Duplicate product variant in cart." });
    seen.add(key);
    normalized.push({ productId, variantId, quantity, color, size });
  }

  const ids = normalized.map(x => x.productId);
  const products = await Product.find({ tenantId: req.tenant._id, _id: { $in: ids } })
    .select("+purchasePrice +sellingPrice +discountedPrice")
    .lean();
  const productMap = new Map(products.map(p => [String(p._id), p]));

  const variantIds = normalized.filter(x => x.variantId).map(x => x.variantId);
  const variants = variantIds.length
    ? await ProductVariant.find({ tenantId: req.tenant._id, _id: { $in: variantIds } })
      .select("+purchasePrice +sellingPrice +discountedPrice").lean()
    : [];
  const variantMap = new Map(variants.map(v => [String(v._id), v]));

  let subtotal = 0;
  let totalCost = 0;
  const orderItems = [];

  for (const item of normalized) {
    const p = productMap.get(item.productId);
    if (!p) return res.status(404).json({ message: "One of the selected products no longer exists." });
    if (!p.isAvailable) return res.status(409).json({ message: `${p.name} is currently unavailable.` });

    let source = p;
    let sku = p.sku;
    let color = item.color;
    let size = item.size;

    if (p.variantEnabled) {
      if (!item.variantId) return res.status(400).json({ message: `Select a size/color variant for ${p.name}.` });
      const v = variantMap.get(item.variantId);
      if (!v || String(v.productId) !== String(p._id)) return res.status(400).json({ message: `Invalid variant selected for ${p.name}.` });
      if (!v.isAvailable || Number(v.stockQuantity) < item.quantity) {
        return res.status(409).json({ message: `${p.name} (${v.size || v.color || v.sku}) has insufficient stock.` });
      }
      source = v;
      sku = v.sku;
      color = v.color || "";
      size = v.size || "";
    } else {
      const stock = Math.max(0, Number(p.stockQuantity ?? 0));
      if (item.quantity > stock) return res.status(409).json({ message: `${p.name} has only ${stock} item${stock === 1 ? "" : "s"} in stock.` });
      if (color && !(p.colors || []).includes(color)) return res.status(400).json({ message: `Invalid color selected for ${p.name}.` });
      if (size && !(p.sizes || []).includes(size)) return res.status(400).json({ message: `Invalid size selected for ${p.name}.` });
    }

    const sellingPrice = Number(source.sellingPrice || 0);
    const discountedPrice = source.discountedPrice != null ? Number(source.discountedPrice) : sellingPrice;
    const purchasePrice = Number(source.purchasePrice || 0);
    const productDiscountPerUnit = Math.max(0, sellingPrice - discountedPrice);
    const lineSubtotal = moneyNumber(sellingPrice * item.quantity);
    const lineProductDiscount = moneyNumber(productDiscountPerUnit * item.quantity);
    const lineDiscountedTotal = moneyNumber(discountedPrice * item.quantity);

    subtotal = moneyNumber(subtotal + lineSubtotal);
    totalCost = moneyNumber(totalCost + purchasePrice * item.quantity);

    orderItems.push({
      product: p._id,
      variant: p.variantEnabled ? source._id : null,
      name: p.name,
      sku,
      color,
      size,
      quantity: item.quantity,
      unitPrice: discountedPrice,
      sellingPrice,
      discountedPrice,
      purchasePrice,
      lineTotal: lineDiscountedTotal,
      productDiscountAmount: lineProductDiscount
    });
  }

  const productDiscountAmount = moneyNumber(orderItems.reduce((sum, item) => sum + Number(item.productDiscountAmount || 0), 0));
  const discountedSubtotal = moneyNumber(subtotal - productDiscountAmount);
  let total = moneyNumber(finalTotal);
  let loyaltyDiscount = 0;
  if (requestedLoyaltyPoints > 0) {
    if (!customer) return res.status(400).json({ message: "Select an existing customer before using loyalty points." });
    const loyaltyConfig = await getLoyaltyConfig(req.tenant._id);
    if (!loyaltyConfig.enabled) return res.status(400).json({ message: "Loyalty program is disabled." });
    if (requestedLoyaltyPoints > Number(customer.loyaltyPointsBalance || 0)) return res.status(400).json({ message: "Customer does not have enough loyalty points." });
    loyaltyDiscount = Math.min(discountedSubtotal, Number((requestedLoyaltyPoints * Number(loyaltyConfig.redemptionRupeesPerPoint || 0)).toFixed(2)));
    total = moneyNumber(Math.max(0, discountedSubtotal - loyaltyDiscount));
  }
  if (!Number.isFinite(total) || total < 0) return res.status(400).json({ message: "Enter a valid final total." });
  if (total > discountedSubtotal) {
    return res.status(400).json({ message: `Final total cannot be greater than the product-discounted total of ₹${discountedSubtotal.toFixed(2)}.` });
  }

  const additionalDiscountAmount = moneyNumber(discountedSubtotal - total);
  const discountAmount = moneyNumber(productDiscountAmount + additionalDiscountAmount);

  // Payment validation is performed server-side. The frontend never decides
  // whether a bill is paid or how much is still due.
  const rawPayments = Array.isArray(payments) ? payments : [];
  let normalizedPayments = rawPayments.map(p => ({
    method: String(p?.method || "").trim(),
    amount: moneyNumber(p?.amount),
    reference: String(p?.reference || "").trim().slice(0, 200),
    note: String(p?.note || "").trim().slice(0, 300)
  })).filter(p => p.method && Number.isFinite(p.amount) && p.amount >= 0);

  if (!normalizedPayments.length) {
    if (!["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method." });
    }
    normalizedPayments = [{ method: paymentMethod, amount: paymentMethod === "Credit" ? 0 : total, reference: "", note: "" }];
  }

  const paymentMethods = new Set(["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other"]);
  if (normalizedPayments.some(p => !paymentMethods.has(p.method))) {
    return res.status(400).json({ message: "Invalid payment method in payment breakdown." });
  }
  const paidAmount = moneyNumber(normalizedPayments.filter(p => p.method !== "Credit").reduce((sum, p) => sum + p.amount, 0));
  const creditAmount = moneyNumber(normalizedPayments.filter(p => p.method === "Credit").reduce((sum, p) => sum + p.amount, 0));
  if (paidAmount > total) return res.status(400).json({ message: "Payment received cannot exceed the invoice total." });
  const dueAmount = moneyNumber(total - paidAmount);
  if (creditAmount > dueAmount) return res.status(400).json({ message: "Credit cannot exceed the outstanding balance." });
  if (dueAmount > 0 && !normalizedPayments.some(p => p.method === "Credit")) {
    return res.status(400).json({ message: "Add a Credit balance entry for any unpaid amount." });
  }
  if (dueAmount > 0 && creditAmount !== dueAmount) {
    return res.status(400).json({ message: `Credit must equal the outstanding balance of ₹${dueAmount.toFixed(2)}.` });
  }
  if (dueAmount === 0 && creditAmount > 0) {
    return res.status(400).json({ message: "Credit cannot be used when the invoice is fully paid." });
  }

  const resolvedPaymentMethod = normalizedPayments.length > 1 || normalizedPayments.some(p => p.method === "Credit" && paidAmount > 0)
    ? "Split Payment"
    : (normalizedPayments[0]?.method || paymentMethod);
  const paymentStatus = dueAmount === 0 ? "paid" : (paidAmount > 0 ? "partial" : "credit");

  const deducted = []; const ledgerIds = []; let order = null;
  try {
    for (const item of normalized) {
      const p = productMap.get(item.productId);
      if (p.variantEnabled) {
        const updated = await ProductVariant.findOneAndUpdate(
          { tenantId: req.tenant._id, _id: item.variantId, productId: item.productId, isAvailable: true, stockQuantity: { $gte: item.quantity }, $expr: { $gte: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, item.quantity] } },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true }
        );
        if (!updated) throw Object.assign(new Error(`${p.name} variant went out of stock. Please refresh and try again.`), { statusCode: 409 });
        await Product.updateOne({ tenantId: req.tenant._id, _id: item.productId }, { $inc: { stockQuantity: -item.quantity } });
        const soldSource = variantMap.get(item.variantId);
        deducted.push({ ...item, variant: true, before: Number(soldSource?.stockQuantity ?? 0), after: Number(updated.stockQuantity), sku: soldSource?.sku || p.sku, productName: p.name });
      } else {
        const updated = await Product.findOneAndUpdate(
          { tenantId: req.tenant._id, _id: item.productId, isAvailable: true, stockQuantity: { $gte: item.quantity }, $expr: { $gte: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, item.quantity] } },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true }
        );
        if (!updated) throw Object.assign(new Error(`${p.name} went out of stock. Please refresh and try again.`), { statusCode: 409 });
        deducted.push({ ...item, variant: false, before: Number(p.stockQuantity), after: Number(updated.stockQuantity), sku: p.sku, productName: p.name });
      }
    }

    const resolvedName = customer?.name || String(customerName || "").trim();
    const resolvedPhone = customer?.phone || String(customerPhone || "").trim();

    order = await Order.create({
      tenantId: req.tenant._id,
      customerId: customer?._id || null,
      orderNumber: await nextOrderNumber(),
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      items: orderItems,
      subtotal,
      productDiscountAmount,
      additionalDiscountAmount,
      discountAmount,
      discountedSubtotal,
      finalTotal: total,
      totalCost,
      profit: moneyNumber(total - totalCost),
      loyaltyPointsRedeemed: requestedLoyaltyPoints,
      loyaltyDiscountAmount: loyaltyDiscount,
      paymentMethod: resolvedPaymentMethod,
      payments: normalizedPayments,
      paymentStatus,
      paidAmount,
      dueAmount,
      idempotencyKey: safeIdempotencyKey,
      notes: String(notes || "").trim()
    });

    for (const item of deducted) {
      const tx = await recordInventoryTransaction({
        tenantId: req.tenant._id,
        product: item.productId,
        variant: item.variant ? item.variantId : null,
        productName: item.productName,
        sku: item.sku,
        type: "SALE",
        quantityBefore: item.before,
        quantityChange: -item.quantity,
        quantityAfter: item.after,
        referenceType: "Order",
        referenceId: order._id,
        note: `Sale ${order.orderNumber}`,
        createdBy: req.admin?._id || null
      });
      ledgerIds.push(tx._id);
    }

    // These are derived/UX fields. The sale itself is already persisted, so
    // failures here must not roll back an otherwise successful order.
    await Promise.all(
      normalized.map(async item => {
        const p = productMap.get(item.productId);
        try {
          if (p.variantEnabled) {
            const available = await ProductVariant.exists({
              tenantId: req.tenant._id, productId: item.productId, isAvailable: true, stockQuantity: { $gt: 0 }
            });
            await Product.updateOne({ tenantId: req.tenant._id, _id: item.productId }, { $set: { isAvailable: Boolean(available) } });
          } else if (Number(p.stockQuantity) - item.quantity <= 0) {
            await Product.updateOne({ tenantId: req.tenant._id, _id: item.productId }, { $set: { isAvailable: false } });
          }
        } catch {}
      })
    );

    if (customer) {
      await Customer.updateOne(
        { _id: customer._id, tenantId: req.tenant._id },
        { $inc: { totalOrders: 1, totalSpent: total }, $set: { lastPurchaseAt: new Date() } }
      ).catch(() => {});

      if (requestedLoyaltyPoints > 0) {
        await redeemPoints({ tenantId: req.tenant._id, customerId: customer._id, points: requestedLoyaltyPoints, note: `Redeemed on ${order.orderNumber}`, createdBy: req.admin?._id || null });
      }
      // Loyalty earning is granted only after the order is fully paid.
      if (paymentStatus === "paid") {
        await earnPoints({
          tenantId: req.tenant._id,
          customerId: customer._id,
          orderId: order._id,
          amount: total,
          createdBy: req.admin?._id || null
        }).catch(() => {});
      }
    }

    res.status(201).json(order);
  } catch (error) {
    if (ledgerIds.length) await InventoryTransaction.deleteMany({ _id: { $in: ledgerIds }, tenantId: req.tenant._id }).catch(() => {});
    if (order?._id) await Order.deleteOne({ _id: order._id, tenantId: req.tenant._id }).catch(() => {});
    await Promise.all(deducted.map(item =>
      item.variant
        ? Promise.all([
            ProductVariant.updateOne({ tenantId: req.tenant._id, _id: item.variantId }, { $inc: { stockQuantity: item.quantity } }),
            Product.updateOne({ tenantId: req.tenant._id, _id: item.productId }, { $inc: { stockQuantity: item.quantity, isAvailable: true } })
          ])
        : Product.updateOne({ tenantId: req.tenant._id, _id: item.productId }, { $inc: { stockQuantity: item.quantity }, $set: { isAvailable: true } })
    ));
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    throw error;
  }
}


export async function returnable(req, res) {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const filter = { tenantId: req.tenant._id, status: "paid", source: { $ne: "ONLINE" } };
  if (q) {
    filter.$or = [
      { orderNumber: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { customerName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { customerPhone: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
    ];
  }

  const orders = await Order.find(filter)
    .sort("-createdAt")
    .limit(limit)
    .lean();

  if (!orders.length) return res.json({ items: [] });

  const orderIds = orders.map(o => o._id);
  const returned = await Return.aggregate([
    { $match: { tenantId: req.tenant._id, orderId: { $in: orderIds } } },
    { $unwind: "$items" },
    { $match: { "items.orderItemIndex": { $ne: null } } },
    { $group: {
      _id: { orderId: "$orderId", itemIndex: "$items.orderItemIndex" },
      quantity: { $sum: "$items.quantity" }
    } }
  ]);

  const returnedMap = new Map(
    returned.map(x => [`${x._id.orderId}:${x._id.itemIndex}`, Number(x.quantity || 0)])
  );

  const items = orders.map(order => {
    const remainingItems = (order.items || []).map((item, index) => {
      const returnedQty = returnedMap.get(`${order._id}:${index}`) || 0;
      const remainingQuantity = Math.max(0, Number(item.quantity || 0) - returnedQty);
      return {
        orderItemIndex: index,
        ...item,
        returnedQuantity: returnedQty,
        remainingQuantity
      };
    }).filter(item => item.remainingQuantity > 0);

    return {
      ...order,
      items: remainingItems
    };
  }).filter(order => order.items.length > 0);

  res.json({ items });
}

export async function list(req, res) {
  const pageNum = Math.max(Number(req.query.page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { tenantId: req.tenant._id, status: { $ne: "cancelled" }, ...(req.query.source === "online" ? { source: "ONLINE" } : req.query.source === "pos" ? { source: "POS" } : {}) };
  const q = String(req.query.q || "").trim();
  if (q) { const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); filter.$or = [{ orderNumber: new RegExp(safe,"i") },{ customerName: new RegExp(safe,"i") },{ customerPhone: new RegExp(safe,"i") }]; }
  if (req.query.all !== "1") {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (!Number.isNaN(from.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $gte: from };
    if (!Number.isNaN(to.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lte: to };
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort("-createdAt").skip((pageNum - 1) * safeLimit).limit(safeLimit).lean(),
    Order.countDocuments(filter)
  ]);
  const [revenue, returns] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId: req.tenant._id, status: "paid" } },
      { $group: {
        _id: null,
        revenue: { $sum: "$finalTotal" },
        discounts: { $sum: "$discountAmount" },
        productDiscounts: { $sum: { $ifNull: ["$productDiscountAmount", 0] } },
        additionalDiscounts: { $sum: { $ifNull: ["$additionalDiscountAmount", 0] } },
        profit: { $sum: "$profit" },
        orders: { $sum: 1 }
      } }
    ]),
    Return.aggregate([{ $match: { tenantId: req.tenant._id } }, { $group: {
      _id: null,
      amount: { $sum: "$returnAmount" },
      profitImpact: { $sum: "$profitImpact" },
      returns: { $sum: 1 }
    } }])
  ]);
  const gross = revenue[0] || { revenue: 0, discounts: 0, productDiscounts: 0, additionalDiscounts: 0, profit: 0, orders: 0 };
  const returned = returns[0] || { amount: 0, profitImpact: 0, returns: 0 };
  res.json({
    items,
    pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
    summary: {
      ...gross,
      returns: returned.returns,
      returnedAmount: returned.amount,
      returnedProfitImpact: returned.profitImpact,
      netRevenue: moneyNumber(gross.revenue - returned.amount),
      netProfit: moneyNumber(gross.profit - returned.profitImpact)
    }
  });
}

export async function get(req, res) {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
  if (!order) return res.status(404).json({ message: "Order not found." });
  res.json(order);
}


export async function addPayment(req, res) {
  const { method, amount, reference = "", note = "" } = req.body || {};
  const allowed = new Set(["Cash", "UPI", "Card", "Bank Transfer", "Other", "Cash on Delivery", "Online Payment"]);
  const safeMethod = String(method || "").trim();
  const safeAmount = moneyNumber(amount);

  if (!allowed.has(safeMethod) || !Number.isFinite(safeAmount) || safeAmount <= 0) {
    return res.status(400).json({ message: "Enter a valid payment method and amount." });
  }

  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenant._id, status: "paid" });
  if (!order) return res.status(404).json({ message: "Order not found." });

  const currentPaid = Number(order.paidAmount || 0);
  const due = moneyNumber(Math.max(0, Number(order.finalTotal || 0) - currentPaid));
  if (safeAmount > due) return res.status(400).json({ message: `Payment cannot exceed the outstanding balance of ₹${due.toFixed(2)}.` });

  order.payments.push({
    method: safeMethod,
    amount: safeAmount,
    reference: String(reference || "").trim().slice(0, 200),
    note: String(note || "").trim().slice(0, 300)
  });
  order.paidAmount = moneyNumber(currentPaid + safeAmount);
  order.dueAmount = moneyNumber(Number(order.finalTotal || 0) - order.paidAmount);
  order.paymentStatus = order.dueAmount === 0 ? "paid" : "partial";
  order.paymentMethod = order.payments.length > 1 ? "Split Payment" : safeMethod;
  await order.save();

  if (order.paymentStatus === "paid" && order.customerId) {
    if (order.source === "ONLINE" && !order.deliveryTracking?.trackingId && order.fulfillmentStatus !== "cancelled") order.fulfillmentStatus = "processing";
    await earnPoints({ tenantId: req.tenant._id, customerId: order.customerId, orderId: order._id, amount: order.finalTotal, createdBy: req.admin?._id || null }).catch(() => {});
    await order.save();
  }

  res.json(order);
}
