import SaaSPlan from "../models/SaaSPlan.js";
import { getTenantUsageHistory, measureTenantUsage } from "../services/usageService.js";
import { ensureDefaultPlans } from "../utils/seedPlans.js";

function withUsageLimits(usage, plan) {
  const limits = plan?.limits || {};
  const item = (used, limit) => ({
    used: Number(used || 0),
    limit: limit == null ? null : Number(limit),
    unlimited: limit == null || Number(limit) < 0,
    percent: limit == null || Number(limit) < 0 ? 0 : Math.min(100, Number(limit) === 0 ? 100 : (Number(used || 0) / Number(limit)) * 100)
  });
  return {
    products: item(usage.products, limits.products),
    variants: item(usage.variants, limits.variants),
    staff: item(usage.staff, limits.staff),
    customers: item(usage.customers, limits.customers),
    orders: item(usage.orders, limits.orders),
    storageBytes: item(usage.storageBytes, limits.storageMb == null ? null : Number(limits.storageMb) * 1024 * 1024)
  };
}

export async function currentUsage(req, res) {
  await ensureDefaultPlans();
  const usage = await measureTenantUsage(req.tenant._id);
  const plan = await SaaSPlan.findOne({ code: req.tenant.plan, active: true }).lean();
  const limits = withUsageLimits(usage, plan);
  res.json({
    usage,
    plan: plan ? { code: plan.code, name: plan.name, limits: plan.limits || {} } : null,
    limits,
    measuredAt: usage.measuredAt
  });
}

export async function usageHistory(req, res) {
  const history = await getTenantUsageHistory(req.tenant._id, Math.min(24, Math.max(1, Number(req.query.limit) || 12)));
  res.json({ history });
}
