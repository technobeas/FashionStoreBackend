import SaaSPlan from "../models/SaaSPlan.js";
import Product from "../models/Product.js";
import Admin from "../models/Admin.js";
import Customer from "../models/Customer.js";
import { sanitizeFeatures } from "../config/features.js";

export function requirePlanCapacity(resource, Model = null) {
  return async (req, res, next) => {
    try {
      const plan = await SaaSPlan.findOne({ code: req.tenant?.plan, active: true }).lean();
      if (!plan) return next();
      const limit = plan.limits?.[resource];
      if (limit == null || limit < 0) return next();
      const count = await (Model || ({ products: Product, staff: Admin, customers: Customer }[resource])).countDocuments(
        resource === "staff" ? { tenantId: req.tenant._id, role: { $ne: "owner" } } : { tenantId: req.tenant._id }
      );
      if (count >= limit) return res.status(402).json({ message: `${resource} limit reached for the ${plan.name} plan.`, code: "PLAN_LIMIT_REACHED", resource, limit, plan: plan.code });
      next();
    } catch (e) { next(e); }
  };
}


export async function getEffectivePlanFeatures(tenant) {
  const plan = await SaaSPlan.findOne({ code: tenant?.plan, active: true }).lean();
  const base = new Set(sanitizeFeatures(plan?.features || []));
  for (const feature of sanitizeFeatures(tenant?.featureOverrides?.enabled || [])) base.add(feature);
  for (const feature of sanitizeFeatures(tenant?.featureOverrides?.disabled || [])) base.delete(feature);
  return { plan, features: [...base] };
}

export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const { features, plan } = await getEffectivePlanFeatures(req.tenant);
      if (!features.includes(feature)) return res.status(403).json({ message: `The ${feature} feature is not enabled for this store.`, code: "FEATURE_NOT_ENABLED", feature, plan: plan?.code || req.tenant?.plan });
      next();
    } catch (e) { next(e); }
  };
}
