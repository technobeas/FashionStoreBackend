import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireBillingTenant } from "../middleware/billingTenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { plans, overview, webhook, platformBilling } from "../controllers/billingController.js";

const r = Router();
r.post("/webhooks/:provider", webhook);
r.use(requireAuth);
r.get("/plans", plans);
r.get("/platform", (req, res, next) => req.admin.role === "super_admin" ? next() : res.status(403).json({ message: "Super Admin access required." }), platformBilling);
r.use(requireBillingTenant, requirePermission("billing.view"));
r.get("/", overview);
// Tenant subscription changes are intentionally platform-managed for now.
// Shop admins can view their plan and contact the platform team for upgrades.
export default r;
