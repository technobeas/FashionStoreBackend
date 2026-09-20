import mongoose from "mongoose";
import Expense, { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../models/Expense.js";

const money = n => Math.round(Number(n || 0) * 100) / 100;

function range(query) {
  const end = query.end ? new Date(query.end) : new Date();
  const start = query.start ? new Date(query.start) : new Date(end.getTime() - 29 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const e = new Error("Invalid expense date range."); e.statusCode = 400; throw e;
  }
  if (start > end) {
    const e = new Error("Expense start date cannot be after end date."); e.statusCode = 400; throw e;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function normalize(body, adminId) {
  const category = String(body.category || "").trim();
  const amount = money(body.amount);
  const description = String(body.description || "").trim();
  const paymentMethod = String(body.paymentMethod || "Cash").trim();
  const date = body.date ? new Date(body.date) : new Date();

  if (!category) throw Object.assign(new Error("Expense category is required."), { statusCode: 400 });
  if (category.length > 80) throw Object.assign(new Error("Expense category is too long."), { statusCode: 400 });
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("Expense amount must be greater than zero."), { statusCode: 400 });
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw Object.assign(new Error("Invalid expense payment method."), { statusCode: 400 });
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error("Invalid expense date."), { statusCode: 400 });

  return { category, amount, description, paymentMethod, date, createdBy: adminId || null };
}

export async function list(req, res) {
  const { start, end } = range(req.query);
  const tenantId = req.tenant._id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = { tenantId, date: { $gte: start, $lte: end } };

  if (req.query.category) filter.category = String(req.query.category).trim();
  if (req.query.paymentMethod) filter.paymentMethod = String(req.query.paymentMethod).trim();
  if (req.query.q) {
    const q = String(req.query.q).trim();
    if (q) filter.$or = [
      { category: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } }
    ];
  }

  const [items, total, summary, categories] = await Promise.all([
    Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("createdBy", "username").lean(),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $group: {
      _id: null,
      total: { $sum: "$amount" },
      count: { $sum: 1 }
    }}]),
    Expense.aggregate([{ $match: filter }, { $group: {
      _id: "$category",
      amount: { $sum: "$amount" },
      count: { $sum: 1 }
    }}, { $sort: { amount: -1 } }])
  ]);

  res.json({
    items,
    total,
    page,
    limit,
    range: { start, end },
    summary: summary[0] ? { total: money(summary[0].total), count: summary[0].count } : { total: 0, count: 0 },
    categories: categories.map(x => ({ category: x._id, amount: money(x.amount), count: x.count })),
    expenseCategories: EXPENSE_CATEGORIES
  });
}

export async function get(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid expense." });
  const x = await Expense.findOne({ _id: req.params.id, tenantId: req.tenant._id }).populate("createdBy", "username").lean();
  if (!x) return res.status(404).json({ message: "Expense not found." });
  res.json(x);
}

export async function create(req, res) {
  try {
    const data = normalize(req.body || {}, req.admin?._id);
    const x = await Expense.create({ tenantId: req.tenant._id, ...data });
    res.status(201).json(x);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ message: e.message });
    throw e;
  }
}

export async function update(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid expense." });
  try {
    const data = normalize(req.body || {}, req.admin?._id);
    const x = await Expense.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: data },
      { new: true, runValidators: true }
    ).lean();
    if (!x) return res.status(404).json({ message: "Expense not found." });
    res.json(x);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ message: e.message });
    throw e;
  }
}

export async function remove(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid expense." });
  const x = await Expense.findOneAndDelete({ _id: req.params.id, tenantId: req.tenant._id });
  if (!x) return res.status(404).json({ message: "Expense not found." });
  res.json({ ok: true });
}

export async function summary(req, res) {
  const { start, end } = range(req.query);
  const tenantId = req.tenant._id;
  const match = { tenantId, date: { $gte: start, $lte: end } };
  const [totals, byCategory, byPayment, daily] = await Promise.all([
    Expense.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: "$category", amount: { $sum: "$amount" } } }, { $sort: { amount: -1 } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: "$paymentMethod", amount: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, amount: { $sum: "$amount" } } }, { $sort: { _id: 1 } }])
  ]);

  res.json({
    range: { start, end },
    total: money(totals[0]?.total),
    count: totals[0]?.count || 0,
    byCategory: byCategory.map(x => ({ category: x._id, amount: money(x.amount) })),
    byPayment: byPayment.map(x => ({ method: x._id, amount: money(x.amount), count: x.count })),
    daily: daily.map(x => ({ date: x._id, amount: money(x.amount) }))
  });
}
