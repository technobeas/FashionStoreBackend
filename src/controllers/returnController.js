import mongoose from "mongoose";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import InventoryTransaction from "../models/InventoryTransaction.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";
import Return from "../models/Return.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";

function moneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function nextReturnNumber() {
  const stamp = new Date();
  const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
  const time = `${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}${String(stamp.getSeconds()).padStart(2, "0")}`;
  const random = Math.floor(100 + Math.random() * 900);
  return `JDR-${date}-${time}-${random}`;
}

/**
 * Returns are order-linked in the current flow.
 * This prevents returning quantities that were never sold and makes every
 * return traceable to the exact order line and exact variant.
 */
export async function create(req, res) {
  const {
    orderId,
    items = [],
    returnAmount,
    reason = "",
    notes = ""
  } = req.body || {};

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ message: "Select a valid order for this return." });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Add at least one order item to return." });
  }

  const order = await Order.findOne({
    _id: orderId,
    tenantId: req.tenant._id,
    status: "paid"
  }).lean();

  if (!order) return res.status(404).json({ message: "Order not found or it is not returnable." });
  if (order.source === "ONLINE") return res.status(403).json({ message: "Online orders are not eligible for returns. Please visit the store for assistance." });

  const normalized = [];
  const seen = new Set();

  for (const raw of items) {
    const orderItemIndex = Number(raw.orderItemIndex);
    const quantity = Math.floor(Number(raw.quantity));

    if (!Number.isInteger(orderItemIndex) || orderItemIndex < 0 || orderItemIndex >= order.items.length) {
      return res.status(400).json({ message: "Invalid order item selected." });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Return quantity must be at least 1." });
    }
    if (seen.has(orderItemIndex)) {
      return res.status(400).json({ message: "The same order item cannot be added twice." });
    }
    seen.add(orderItemIndex);
    normalized.push({ orderItemIndex, quantity });
  }

  // Calculate quantities already returned for this exact order line.
  const priorReturns = await Return.aggregate([
    { $match: { tenantId: req.tenant._id, orderId: order._id } },
    { $unwind: "$items" },
    { $match: { "items.orderItemIndex": { $in: normalized.map(x => x.orderItemIndex) } } },
    { $group: {
      _id: "$items.orderItemIndex",
      quantity: { $sum: "$items.quantity" }
    } }
  ]);
  const returnedMap = new Map(priorReturns.map(x => [Number(x._id), Number(x.quantity || 0)]));

  const returnItems = [];
  let calculatedAmount = 0;
  let totalCost = 0;

  for (const request of normalized) {
    const source = order.items[request.orderItemIndex];
    if (!source) return res.status(400).json({ message: "Order item no longer exists." });

    const alreadyReturned = returnedMap.get(request.orderItemIndex) || 0;
    const remaining = Math.max(0, Number(source.quantity || 0) - alreadyReturned);

    if (request.quantity > remaining) {
      return res.status(409).json({
        message: `${source.name}${source.size || source.color ? ` (${[source.size, source.color].filter(Boolean).join(" / ")})` : ""} has only ${remaining} item${remaining === 1 ? "" : "s"} available for return.`
      });
    }

    // Use the historical sale price, not today's product price. This keeps
    // return amounts correct even after the product price changes.
    const refundUnitPrice = Number(source.unitPrice ?? source.discountedPrice ?? 0);
    const purchasePrice = Number(source.purchasePrice ?? 0);
    const lineReturnAmount = moneyNumber(refundUnitPrice * request.quantity);
    const lineCost = moneyNumber(purchasePrice * request.quantity);

    calculatedAmount = moneyNumber(calculatedAmount + lineReturnAmount);
    totalCost = moneyNumber(totalCost + lineCost);

    returnItems.push({
      product: source.product,
      variant: source.variant || null,
      orderItemIndex: request.orderItemIndex,
      name: source.name,
      sku: source.sku,
      color: source.color || "",
      size: source.size || "",
      quantity: request.quantity,
      sellingPrice: Number(source.sellingPrice ?? refundUnitPrice),
      discountedPrice: Number(source.discountedPrice ?? refundUnitPrice),
      refundUnitPrice,
      purchasePrice,
      lineReturnAmount,
      lineCost
    });
  }

  const total = returnAmount === "" || returnAmount == null
    ? calculatedAmount
    : moneyNumber(returnAmount);

  if (!Number.isFinite(total) || total < 0) {
    return res.status(400).json({ message: "Enter a valid return amount." });
  }
  if (total > calculatedAmount) {
    return res.status(400).json({
      message: `Return amount cannot be greater than the historical sale value of ₹${calculatedAmount.toFixed(2)}.`
    });
  }

  // Verify all referenced products/variants still belong to this tenant before
  // touching stock. The order snapshot remains authoritative for pricing.
  const productIds = [...new Set(returnItems.map(x => String(x.product)))];
  const products = await Product.find({
    tenantId: req.tenant._id,
    _id: { $in: productIds }
  }).select("_id name variantEnabled stockQuantity isAvailable").lean();
  const productMap = new Map(products.map(p => [String(p._id), p]));

  const variantIds = [...new Set(returnItems.filter(x => x.variant).map(x => String(x.variant)))];
  const variants = variantIds.length
    ? await ProductVariant.find({
        tenantId: req.tenant._id,
        _id: { $in: variantIds }
      }).select("_id productId stockQuantity isAvailable sku").lean()
    : [];
  const variantMap = new Map(variants.map(v => [String(v._id), v]));

  for (const item of returnItems) {
    const product = productMap.get(String(item.product));
    if (!product) return res.status(409).json({ message: `Product for ${item.name} is no longer available.` });
    if (item.variant) {
      const variant = variantMap.get(String(item.variant));
      if (!variant || String(variant.productId) !== String(item.product)) {
        return res.status(409).json({ message: `Variant for ${item.name} is no longer valid.` });
      }
    }
  }

  const restored = [];
  const ledgerIds = [];
  let record = null;

  try {
    for (const item of returnItems) {
      const product = productMap.get(String(item.product));

      if (item.variant) {
        const variant = variantMap.get(String(item.variant));
        const before = Number(variant.stockQuantity || 0);
        const updated = await ProductVariant.findOneAndUpdate(
          {
            tenantId: req.tenant._id,
            _id: variant._id,
            productId: product._id
          },
          { $inc: { stockQuantity: item.quantity }, $set: { isAvailable: true } },
          { new: true }
        );

        if (!updated) {
          throw Object.assign(new Error(`Could not restore ${item.name} variant stock.`), { statusCode: 409 });
        }

        await Product.updateOne(
          { tenantId: req.tenant._id, _id: product._id },
          {
            $inc: { stockQuantity: item.quantity },
            $set: { isAvailable: true }
          }
        );

        restored.push({
          ...item,
          variantId: variant._id,
          before,
          after: Number(updated.stockQuantity),
          sku: variant.sku || item.sku
        });
      } else {
        const before = Number(product.stockQuantity || 0);
        const updated = await Product.findOneAndUpdate(
          { tenantId: req.tenant._id, _id: product._id },
          {
            $inc: { stockQuantity: item.quantity },
            $set: { isAvailable: true }
          },
          { new: true }
        );

        if (!updated) {
          throw Object.assign(new Error(`Could not restore ${item.name} stock.`), { statusCode: 409 });
        }

        restored.push({
          ...item,
          variantId: null,
          before,
          after: Number(updated.stockQuantity),
          sku: product.sku || item.sku
        });
      }
    }

    const profitImpact = moneyNumber(total - totalCost);
    record = await Return.create({
      tenantId: req.tenant._id,
      orderId: order._id,
      customerId: order.customerId || null,
      processedBy: req.admin?._id || null,
      returnNumber: await nextReturnNumber(),
      items: returnItems,
      calculatedAmount,
      returnAmount: total,
      totalCost,
      profitImpact,
      customerName: String(order.customerName || "").trim(),
      customerPhone: String(order.customerPhone || "").trim(),
      reason: String(reason || "").trim(),
      notes: String(notes || "").trim()
    });

    for (const item of restored) {
      const tx = await recordInventoryTransaction({
        tenantId: req.tenant._id,
        product: item.product,
        variant: item.variantId,
        productName: item.name,
        sku: item.sku,
        type: "RETURN",
        quantityBefore: item.before,
        quantityChange: item.quantity,
        quantityAfter: item.after,
        referenceType: "Return",
        referenceId: record._id,
        note: `Return ${record.returnNumber} from ${order.orderNumber}`,
        createdBy: req.admin?._id || null
      });
      ledgerIds.push(tx._id);
    }

    const orderReturns = await Return.aggregate([
      { $match: { tenantId: req.tenant._id, orderId: order._id } },
      { $group: { _id: null, amount: { $sum: "$returnAmount" }, items: { $sum: 1 } } }
    ]);
    const returnedAmount = moneyNumber(orderReturns[0]?.amount || 0);
    const orderOriginalTotal = Number(order.finalTotal || 0);
    const returnStatus = returnedAmount >= orderOriginalTotal && orderOriginalTotal > 0 ? "full" : "partial";

    await Order.updateOne(
      { _id: order._id, tenantId: req.tenant._id },
      {
        $set: {
          returnedAmount,
          returnStatus
        }
      }
    );

    if (order.customerId) {
      await Customer.updateOne(
        { _id: order.customerId, tenantId: req.tenant._id },
        {
          $inc: {
            totalSpent: -total,
            totalReturns: 1,
            totalReturnAmount: total
          }
        }
      ).catch(() => {});
    }

    res.status(201).json({
      ...record.toObject(),
      orderNumber: order.orderNumber,
      remainingOrderAmount: moneyNumber(Math.max(0, orderOriginalTotal - returnedAmount))
    });
  } catch (error) {
    if (ledgerIds.length) {
      await InventoryTransaction.deleteMany({
        _id: { $in: ledgerIds },
        tenantId: req.tenant._id
      }).catch(() => {});
    }
    if (record?._id) {
      await Return.deleteOne({ _id: record._id, tenantId: req.tenant._id }).catch(() => {});
    }

    await Promise.all(restored.map(item =>
      item.variantId
        ? Promise.all([
            ProductVariant.updateOne(
              { tenantId: req.tenant._id, _id: item.variantId, productId: item.product },
              { $inc: { stockQuantity: -item.quantity } }
            ),
            Product.updateOne(
              { tenantId: req.tenant._id, _id: item.product },
              { $inc: { stockQuantity: -item.quantity } }
            )
          ])
        : Product.updateOne(
            { tenantId: req.tenant._id, _id: item.product },
            { $inc: { stockQuantity: -item.quantity } }
          )
    ));

    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    throw error;
  }
}

export async function list(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const [items, total, summary] = await Promise.all([
    Return.find({ tenantId: req.tenant._id })
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("orderId", "orderNumber finalTotal returnStatus")
      .populate("customerId", "name phone")
      .populate("processedBy", "name username")
      .lean(),
    Return.countDocuments({ tenantId: req.tenant._id }),
    Return.aggregate([{
      $match: { tenantId: req.tenant._id }
    }, {
      $group: {
        _id: null,
        amount: { $sum: "$returnAmount" },
        cost: { $sum: "$totalCost" },
        profitImpact: { $sum: "$profitImpact" },
        returns: { $sum: 1 }
      }
    }])
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    summary: summary[0] || { amount: 0, cost: 0, profitImpact: 0, returns: 0 }
  });
}
