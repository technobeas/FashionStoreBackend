import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { currentUsage, usageHistory } from "../controllers/usageController.js";

const r = Router();
r.use(requireAuth, requireTenant, requirePermission("usage.view"));
r.get("/", currentUsage);
r.get("/history", usageHistory);
export default r;
