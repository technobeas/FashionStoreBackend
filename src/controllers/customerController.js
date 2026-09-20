import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Return from "../models/Return.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

const SEGMENTS = ["new", "returning", "loyal", "vip", "at_risk", "inactive"];

function segmentFor(stats = {}) {
  const orders = Number(stats.orderCount || 0);
  const spent = Number(stats.spent || 0);
  const last = stats.lastPurchaseAt ? new Date(stats.lastPurchaseAt).getTime() : 0;
  const days = last ? Math.max(0, (Date.now() - last) / 86400000) : Infinity;

  if (spent >= 50000 || orders >= 10) return "vip";
  if (days > 180) return "inactive";
  if (days > 60) return "at_risk";
  if (orders >= 3) return "loyal";
  if (orders >= 2) return "returning";
  return "new";
}

async function customerStatsMap(tenantId, customerIds = null) {
  const match = { tenantId, status: { $ne: "cancelled" }, customerId: { $ne: null } };
  if (customerIds?.length) match.customerId = { $in: customerIds };

  const rows = await Order.aggregate([
    { $match: match },
    { $group: {
      _id: "$customerId",
      orderCount: { $sum: 1 },
      spent: { $sum: "$finalTotal" },
      paid: { $sum: "$paidAmount" },
      due: { $sum: "$dueAmount" },
      firstPurchaseAt: { $min: "$createdAt" },
      lastPurchaseAt: { $max: "$createdAt" }
    } }
  ]);

  return new Map(rows.map(r => [String(r._id), r]));
}

async function enrichCustomerSegments(tenantId, customers) {
  if (!customers.length) return customers;
  const ids = customers.map(c => c._id);
  const stats = await customerStatsMap(tenantId, ids);

  return customers.map(c => {
    const s = stats.get(String(c._id)) || {};
    const orderCount = Number(s.orderCount || 0);
    const spent = Number(s.spent || 0);
    return {
      ...c,
      totalOrders: orderCount,
      totalSpent: spent,
      dueAmount: Number(s.due || 0),
      totalReturnAmount: Number(c.totalReturnAmount || 0),
      lastPurchaseAt: s.lastPurchaseAt || c.lastPurchaseAt || null,
      averageOrderValue: orderCount ? Number((spent / orderCount).toFixed(2)) : 0,
      lifetimeValue: spent,
      crmSegment: segmentFor(s)
    };
  });
}

export async function list(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const q = clean(req.query.q, 80);
  const segment = clean(req.query.segment, 30);
  const filter = { tenantId: req.tenant._id };

  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: new RegExp(safe, "i") },
      { phone: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
      { tags: new RegExp(safe, "i") }
    ];
  }

  let total = await Customer.countDocuments(filter);
  let items;

  if (SEGMENTS.includes(segment)) {
    const all = await Customer.find(filter).sort("-updatedAt").lean();
    const enriched = await enrichCustomerSegments(req.tenant._id, all);
    const matched = enriched.filter(c => c.crmSegment === segment);
    total = matched.length;
    items = matched.slice((page - 1) * limit, page * limit);
  } else {
    items = await Customer.find(filter).sort("-updatedAt").skip((page - 1) * limit).limit(limit).lean();
    items = await enrichCustomerSegments(req.tenant._id, items);
  }

  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function crmOverview(req, res) {
  const tenantId = req.tenant._id;
  const days = Math.min(Math.max(Number(req.query.days) || 365, 30), 730);
  const since = new Date(Date.now() - days * 86400000);

  const [customers, orderAgg, recentOrders, returns] = await Promise.all([
    Customer.find({ tenantId }).lean(),
    Order.aggregate([
      { $match: { tenantId, status: { $ne: "cancelled" }, customerId: { $ne: null } } },
      { $group: {
        _id: "$customerId",
        orders: { $sum: 1 },
        spent: { $sum: "$finalTotal" },
        lastPurchaseAt: { $max: "$createdAt" },
        firstPurchaseAt: { $min: "$createdAt" }
      } }
    ]),
    Order.find({ tenantId, status: { $ne: "cancelled" }, customerId: { $ne: null }, createdAt: { $gte: since } })
      .select("customerId finalTotal createdAt items")
      .sort("-createdAt").limit(5000).lean(),
    Return.aggregate([
      { $match: { tenantId, customerId: { $ne: null }, createdAt: { $gte: since } } },
      { $group: { _id: "$customerId", count: { $sum: 1 }, amount: { $sum: "$returnAmount" } } }
    ])
  ]);

  const statMap = new Map(orderAgg.map(x => [String(x._id), x]));
  const returnMap = new Map(returns.map(x => [String(x._id), x]));
  const enriched = customers.map(c => {
    const s = statMap.get(String(c._id)) || {};
    return { ...c, ...s, crmSegment: segmentFor(s) };
  });

  const counts = Object.fromEntries(SEGMENTS.map(s => [s, enriched.filter(c => c.crmSegment === s).length]));
  const active = enriched.filter(c => c.lastPurchaseAt && new Date(c.lastPurchaseAt) >= since);
  const repeat = enriched.filter(c => Number(c.orders || 0) >= 2);
  const totalSpent = enriched.reduce((n, c) => n + Number(c.spent || 0), 0);
  const recentSpent = recentOrders.reduce((n, o) => n + Number(o.finalTotal || 0), 0);

  const productCounts = new Map();
  for (const o of recentOrders) {
    for (const item of (o.items || [])) {
      const key = String(item.product || "");
      if (!key) continue;
      const row = productCounts.get(key) || { productId: item.product, name: item.name || "Product", quantity: 0, revenue: 0 };
      row.quantity += Number(item.quantity || 0);
      row.revenue += Number(item.lineTotal || 0);
      productCounts.set(key, row);
    }
  }

  const topProducts = [...productCounts.values()].sort((a,b) => b.quantity-a.quantity).slice(0, 10);
  const customerActivity = enriched
    .filter(c => c.lastPurchaseAt)
    .sort((a,b) => new Date(b.lastPurchaseAt) - new Date(a.lastPurchaseAt))
    .slice(0, 12)
    .map(c => ({ _id: c._id, name: c.name, phone: c.phone, segment: c.crmSegment, orders: c.orders || 0, spent: c.spent || 0, lastPurchaseAt: c.lastPurchaseAt }));
  const segmentCustomers = Object.fromEntries(SEGMENTS.map(key => [
    key,
    enriched.filter(c => c.crmSegment === key)
      .sort((a,b) => Number(b.spent || 0) - Number(a.spent || 0))
      .slice(0, 100)
      .map(c => ({ _id: c._id, name: c.name, phone: c.phone, spent: c.spent || 0, orders: c.orders || 0, lastPurchaseAt: c.lastPurchaseAt }))
  ]));

  res.json({
    periodDays: days,
    summary: {
      totalCustomers: customers.length,
      customersWithOrders: enriched.filter(c => Number(c.orders || 0) > 0).length,
      activeCustomers: active.length,
      repeatCustomers: repeat.length,
      repeatRate: enriched.length ? Number((repeat.length / enriched.length * 100).toFixed(1)) : 0,
      lifetimeRevenue: totalSpent,
      periodRevenue: recentSpent,
      averageCustomerValue: enriched.length ? Number((totalSpent / enriched.length).toFixed(2)) : 0,
      returns: returns.reduce((n, r) => n + Number(r.amount || 0), 0)
    },
    segments: counts,
    topProducts,
    segmentCustomers,
    recentCustomers: customerActivity,
    atRisk: enriched.filter(c => c.crmSegment === "at_risk").sort((a,b) => Number(b.spent||0)-Number(a.spent||0)).slice(0, 20)
      .map(c => ({ _id: c._id, name: c.name, phone: c.phone, spent: c.spent || 0, orders: c.orders || 0, lastPurchaseAt: c.lastPurchaseAt })),
    vip: enriched.filter(c => c.crmSegment === "vip").sort((a,b) => Number(b.spent||0)-Number(a.spent||0)).slice(0, 20)
      .map(c => ({ _id: c._id, name: c.name, phone: c.phone, spent: c.spent || 0, orders: c.orders || 0, lastPurchaseAt: c.lastPurchaseAt }))
  });
}

export async function search(req, res) {
  const q = clean(req.query.q, 80);
  if (!q) return res.json({ items: [] });
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const items = await Customer.find({
    tenantId: req.tenant._id,
    $or: [{ name: new RegExp(safe, "i") }, { phone: new RegExp(safe, "i") }, { email: new RegExp(safe, "i") }]
  }).sort({ updatedAt: -1 }).limit(10).lean();
  res.json({ items });
}

export async function get(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid customer." });
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
  if (!customer) return res.status(404).json({ message: "Customer not found." });

  const [orders, orderStats, returns, favoriteProducts, favoriteCategories] = await Promise.all([
    Order.find({ tenantId: req.tenant._id, customerId: customer._id }).sort("-createdAt").limit(100).lean(),
    Order.aggregate([
      { $match: { tenantId: req.tenant._id, customerId: customer._id, status: { $ne: "cancelled" } } },
      { $group: { _id: null, orderCount: { $sum: 1 }, grossSpent: { $sum: "$finalTotal" }, paid: { $sum: "$paidAmount" }, due: { $sum: "$dueAmount" }, returns: { $sum: "$returnedAmount" }, firstPurchaseAt: { $min: "$createdAt" }, lastPurchaseAt: { $max: "$createdAt" } } }
    ]),
    Return.find({ tenantId: req.tenant._id, customerId: customer._id }).sort("-createdAt").limit(50).lean(),
    Order.aggregate([
      { $match: { tenantId: req.tenant._id, customerId: customer._id, status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.name" }, quantity: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
      { $sort: { quantity: -1 } }, { $limit: 8 }
    ]),
    Order.aggregate([
      { $match: { tenantId: req.tenant._id, customerId: customer._id, status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "product" } },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$category._id", name: { $first: "$category.name" }, quantity: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
      { $match: { "_id": { "$ne": null } } },
      { $sort: { quantity: -1 } }, { $limit: 8 }
    ])
  ]);

  const s = orderStats?.[0] || {};
  const crmSegment = segmentFor(s);
  const computed = {
    orderCount: s.orderCount || 0,
    grossSpent: s.grossSpent || 0,
    paid: s.paid || 0,
    due: s.due || 0,
    returns: s.returns || 0,
    firstPurchaseAt: s.firstPurchaseAt || null,
    lastPurchaseAt: s.lastPurchaseAt || null,
    averageOrderValue: s.orderCount ? Number((s.grossSpent / s.orderCount).toFixed(2)) : 0,
    lifetimeValue: s.grossSpent || 0,
    segment: crmSegment
  };

  res.json({ customer: { ...customer, computed }, orders, returns, favoriteProducts, favoriteCategories });
}

export async function create(req, res) {
  const body = req.body || {};
  const name = clean(body.name, 120);
  const phone = clean(body.phone, 30);
  if (name.length < 2) return res.status(400).json({ message: "Customer name is required." });
  if (phone.length < 3) return res.status(400).json({ message: "Customer phone is required." });

  const data = {
    tenantId: req.tenant._id, name, phone,
    email: clean(body.email, 160).toLowerCase(),
    whatsapp: clean(body.whatsapp, 30),
    tags: Array.isArray(body.tags) ? [...new Set(body.tags.map(v => clean(v, 40)).filter(Boolean))].slice(0, 20) : [],
    address: clean(body.address, 500),
    notes: clean(body.notes, 500),
    followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
    followUpNote: clean(body.followUpNote, 500),
    birthday: body.birthday ? new Date(body.birthday) : null,
    anniversary: body.anniversary ? new Date(body.anniversary) : null
  };
  try {
    const customer = await Customer.create(data);
    res.status(201).json(customer);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "A customer with this phone number already exists." });
    throw error;
  }
}

export async function update(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid customer." });
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!customer) return res.status(404).json({ message: "Customer not found." });

  customer.name = clean(req.body?.name, 120);
  customer.phone = clean(req.body?.phone, 30);
  customer.email = clean(req.body?.email, 160).toLowerCase();
  customer.whatsapp = clean(req.body?.whatsapp, 30);
  customer.tags = Array.isArray(req.body?.tags) ? [...new Set(req.body.tags.map(v => clean(v, 40)).filter(Boolean))].slice(0, 20) : [];
  customer.address = clean(req.body?.address, 500);
  customer.notes = clean(req.body?.notes, 500);
  customer.followUpAt = req.body?.followUpAt ? new Date(req.body.followUpAt) : null;
  customer.followUpNote = clean(req.body?.followUpNote, 500);
  customer.birthday = req.body?.birthday ? new Date(req.body.birthday) : null;
  customer.anniversary = req.body?.anniversary ? new Date(req.body.anniversary) : null;
  if (customer.name.length < 2 || customer.phone.length < 3) return res.status(400).json({ message: "Name and phone are required." });
  try {
    await customer.save();
    res.json(customer);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "A customer with this phone number already exists." });
    throw error;
  }
}

export async function remove(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid customer." });
  const used = await Order.exists({ tenantId: req.tenant._id, customerId: req.params.id });
  if (used) return res.status(409).json({ message: "This customer has sales history and cannot be deleted. You can edit their details instead." });
  const customer = await Customer.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant._id });
  if (!customer) return res.status(404).json({ message: "Customer not found." });
  res.json({ message: "Customer deleted." });
}
