import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import Admin from "../models/Admin.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import SaaSPlan from "../models/SaaSPlan.js";
import { sanitizeFeatures, FEATURE_KEYS, FEATURE_CATALOG } from "../config/features.js";
import Subscription from "../models/Subscription.js";
import { DEFAULT_PLANS, ensureDefaultPlans } from "../utils/seedPlans.js";
import bcrypt from "bcryptjs";
import { slugify } from "../utils/slug.js";
import ShopSettings from "../models/ShopSettings.js";

function tenantPayload(t, owner = null, counts = {}) {
  return {
    id: t._id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    plan: t.plan,
    logo: t.logo || null,
    owner: owner ? { id: owner._id, username: owner.username, active: owner.active } : null,
    subscription: t.subscription || null,
    featureOverrides: t.featureOverrides || { enabled: [], disabled: [] },
    developerBranding: t.developerBranding || null,
    counts,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}



export async function createTenant(req, res) {
  const name = String(req.body?.shopName || "").trim();
  const username = String(req.body?.username || "").toLowerCase().trim();
  const password = String(req.body?.password || "");
  let slug = slugify(req.body?.slug || name);
  const planCode = String(req.body?.plan || "").toLowerCase().trim();

  if (name.length < 2) return res.status(400).json({ message: "Shop name is required." });
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ message: "Username must be 3-40 characters and use letters, numbers, dot, underscore or hyphen." });
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ message: "Password must be at least 12 characters and include uppercase, lowercase and a number." });
  }
  if (!slug) return res.status(400).json({ message: "A valid shop URL could not be generated." });
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/, "");
  const [existingAdmin, plan] = await Promise.all([
    Admin.findOne({ username }).select("_id").lean(),
    SaaSPlan.findOne({ code: planCode, active: true }).lean()
  ]);
  if (existingAdmin) return res.status(409).json({ message: "Username is already in use." });
  if (!plan) return res.status(400).json({ message: "Select an active plan." });
  if (await Tenant.findOne({ slug }).select("_id").lean()) return res.status(409).json({ message: "That shop URL is already in use." });

  const passwordHash = await bcrypt.hash(password, 12);
  const tenant = await Tenant.create({
    name,
    slug,
    status: "active",
    plan: plan.code,
    subscription: {
      status: "active",
      startedAt: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      trialEndsAt: null,
      planCode: plan.code,
      billingCycle: "monthly"
    }
  });
  const admin = await Admin.create({
    username,
    passwordHash,
    role: "owner",
    tenantId: tenant._id,
    permissions: ["*"],
    active: true
  });
  tenant.owner = admin._id;
  await tenant.save();
  await ShopSettings.create({ tenantId: tenant._id, shopName: name });

  await Subscription.findOneAndUpdate(
    { tenantId: tenant._id },
    { $set: { planCode: plan.code, status: "active", billingCycle: "monthly", startedAt: tenant.subscription.startedAt, currentPeriodStart: tenant.subscription.currentPeriodStart, trialEndsAt: null } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  req.auditTenantId = tenant._id;
  res.status(201).json({ tenant: tenantPayload(tenant, admin), message: "Shop registered successfully without a trial." });
}

export async function dashboard(req, res) {
  await ensureDefaultPlans();
  const [tenants, active, trial, suspended, cancelled, admins, products, orders] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: "active" }),
    Tenant.countDocuments({ status: "trial" }),
    Tenant.countDocuments({ status: "suspended" }),
    Tenant.countDocuments({ status: "cancelled" }),
    Admin.countDocuments({ tenantId: { $ne: null } }),
    Product.countDocuments({ tenantId: { $ne: null } }),
    Order.countDocuments({ tenantId: { $ne: null } })
  ]);
  const revenue = await Order.aggregate([
    { $match: { tenantId: { $ne: null }, status: { $nin: ["cancelled"] } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$total", 0] } } } }
  ]);
  res.json({ counts: { tenants, active, trial, suspended, cancelled, admins, products, orders }, sales: revenue[0]?.total || 0 });
}

export async function listTenants(req, res) {
  const status = req.query.status;
  const q = String(req.query.q || "").trim();
  const filter = {};
  if (["active", "trial", "suspended", "cancelled"].includes(status)) filter.status = status;
  if (q) filter.$or = [{ name: { $regex: q, $options: "i" } }, { slug: { $regex: q, $options: "i" } }];
  const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();
  const ids = tenants.map(t => t._id);
  const owners = await Admin.find({ tenantId: { $in: ids }, role: "owner" }).select("username active tenantId").lean();
  const ownerMap = new Map(owners.map(o => [String(o.tenantId), o]));
  const [products, customers, orders] = await Promise.all([
    Product.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: "$tenantId", count: { $sum: 1 } } }]),
    Customer.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: "$tenantId", count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: "$tenantId", count: { $sum: 1 } } }])
  ]);
  const mapCounts = arr => new Map(arr.map(x => [String(x._id), x.count]));
  const pm=mapCounts(products), cm=mapCounts(customers), om=mapCounts(orders);
  res.json({ tenants: tenants.map(t => tenantPayload(t, ownerMap.get(String(t._id)), { products: pm.get(String(t._id))||0, customers: cm.get(String(t._id))||0, orders: om.get(String(t._id))||0 })) });
}

export async function getTenant(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tenant id." });
  const t = await Tenant.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  const owner = await Admin.findOne({ tenantId: t._id, role: "owner" }).select("username active createdAt lastLoginAt").lean();
  const [products, customers, orders] = await Promise.all([
    Product.countDocuments({ tenantId: t._id }), Customer.countDocuments({ tenantId: t._id }), Order.countDocuments({ tenantId: t._id })
  ]);
  res.json({ tenant: tenantPayload(t, owner, { products, customers, orders }) });
}

export async function updateTenantStatus(req, res) {
  const { status } = req.body;
  if (!["active", "trial", "suspended", "cancelled"].includes(status)) return res.status(400).json({ message: "Invalid tenant status." });
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  t.status = status;
  if (!t.subscription) t.subscription = {};
  if (status === "suspended") t.subscription.status = "suspended";
  else if (status === "cancelled") { t.subscription.status = "cancelled"; t.subscription.cancelledAt = new Date(); }
  else if (status === "active") t.subscription.status = "active";
  else if (status === "trial") t.subscription.status = "trialing";
  await t.save();
  await Subscription.findOneAndUpdate({ tenantId: t._id }, { $set: { status: t.subscription.status, planCode: t.subscription.planCode || t.plan, cancelledAt: t.subscription.cancelledAt || null } }, { upsert: true, setDefaultsOnInsert: true });
  res.json({ tenant: tenantPayload(t) });
}

export async function updateTenantPlan(req, res) {
  await ensureDefaultPlans();
  const code = String(req.body.plan || "").toLowerCase().trim();
  const plan = await SaaSPlan.findOne({ code, active: true }).lean();
  if (!plan) return res.status(400).json({ message: "Active plan not found." });
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  t.plan = plan.code;
  if (!t.subscription) t.subscription = {};
  t.subscription.planCode = plan.code;
  t.subscription.status = t.status === "trial" ? "trialing" : "active";
  await t.save();
  await Subscription.findOneAndUpdate({ tenantId: t._id }, { $set: { planCode: plan.code, status: t.status === "trial" ? "trialing" : "active" } }, { upsert: true, setDefaultsOnInsert: true });
  res.json({ tenant: tenantPayload(t) });
}

export async function listPlans(req, res) {
  await ensureDefaultPlans();
  const plans = await SaaSPlan.find().sort({ sortOrder: 1, monthlyPrice: 1 }).lean();
  res.json({ plans, featureCatalog: FEATURE_CATALOG, featureKeys: FEATURE_KEYS });
}

export async function updatePlan(req, res) {
  const code = String(req.params.code || "").toLowerCase();
  const plan = await SaaSPlan.findOne({ code });
  if (!plan) return res.status(404).json({ message: "Plan not found." });
  const fields = ["name","description","monthlyPrice","yearlyPrice","limits","features","active","sortOrder"];
  for (const field of fields) if (req.body[field] !== undefined) plan[field] = field === "features" ? sanitizeFeatures(req.body[field]) : req.body[field];
  await plan.save();
  res.json({ plan });
}


export async function updateTenantFeatures(req, res) {
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  const enabled = sanitizeFeatures(req.body.enabled);
  const disabled = sanitizeFeatures(req.body.disabled);
  t.featureOverrides = { enabled, disabled };
  await t.save();
  res.json({ tenant: tenantPayload(t) });
}

export async function updateTenantSubscription(req, res) {
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  const cycle = ["monthly", "yearly"].includes(req.body.billingCycle) ? req.body.billingCycle : "monthly";
  const start = req.body.startedAt ? new Date(req.body.startedAt) : null;
  const end = req.body.currentPeriodEnd ? new Date(req.body.currentPeriodEnd) : null;
  if (start && Number.isNaN(start.getTime())) return res.status(400).json({ message: "Invalid subscription start date." });
  if (end && Number.isNaN(end.getTime())) return res.status(400).json({ message: "Invalid subscription end date." });
  if (start && end && end <= start) return res.status(400).json({ message: "Subscription end date must be after the start date." });
  if (!t.subscription) t.subscription = {};
  t.subscription.billingCycle = cycle;
  t.subscription.startedAt = start;
  t.subscription.currentPeriodStart = start;
  t.subscription.currentPeriodEnd = end;
  t.subscription.planCode = String(req.body.planCode || t.plan || "starter").toLowerCase();
  t.subscription.status = t.status === "trial" ? "trialing" : (req.body.status || "active");
  t.subscription.notes = String(req.body.notes || "").slice(0, 500);
  await t.save();
  await Subscription.findOneAndUpdate({ tenantId: t._id }, { $set: { planCode: t.subscription.planCode, billingCycle: cycle, startedAt: start, currentPeriodStart: start, currentPeriodEnd: end, status: t.subscription.status } }, { upsert: true, setDefaultsOnInsert: true });
  res.json({ tenant: tenantPayload(t) });
}

export async function updateDeveloperBranding(req, res) {
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: "Tenant not found." });
  t.developerBranding = {
    ...(t.developerBranding?.toObject?.() || t.developerBranding || {}),
    enabled: req.body.enabled !== false,
    name: String(req.body.name || "Noorie Collection Developers").slice(0, 120),
    text: String(req.body.text || "Powered by our fashion commerce platform.").slice(0, 300),
    website: String(req.body.website || "").slice(0, 300),
    email: String(req.body.email || "").slice(0, 160),
    whatsapp: String(req.body.whatsapp || "").slice(0, 40)
  };
  await t.save();
  res.json({ tenant: tenantPayload(t) });
}
