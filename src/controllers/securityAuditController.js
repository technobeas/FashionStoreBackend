import { runTenantIsolationAudit } from "../services/tenantIsolationAuditService.js";

export async function run(req, res, next) {
  try {
    if (!["owner", "super_admin"].includes(req.admin?.role)) {
      return res.status(403).json({ message: "Only the tenant owner or platform super admin can run the isolation audit." });
    }
    const report = await runTenantIsolationAudit(req.tenant._id);
    res.json(report);
  } catch (error) {
    next(error);
  }
}
