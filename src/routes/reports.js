import { Router } from "express";
import { overview } from "../controllers/reportsController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";
const r=Router();
r.get("/overview",requireAuth,requireTenant, requireFeature("reports"),requirePermission("reports.view"),overview);
export default r;
