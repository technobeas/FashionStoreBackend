import { Router } from "express";
import { dashboard } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, resolvePublicTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
const r = Router();
r.get("/dashboard", requireAuth, requireTenant, requirePermission("dashboard.view"), dashboard);
export default r;
