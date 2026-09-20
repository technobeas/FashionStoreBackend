import Tenant from "../models/Tenant.js";

export async function requireBillingTenant(req, res, next) {
  try {
    if (!req.admin?.tenantId) return res.status(403).json({ message: "Tenant context is required." });
    const tenant = await Tenant.findById(req.admin.tenantId).lean();
    if (!tenant) return res.status(403).json({ message: "Tenant is unavailable." });
    req.tenant = tenant;
    next();
  } catch { res.status(500).json({ message: "Unable to resolve tenant." }); }
}
