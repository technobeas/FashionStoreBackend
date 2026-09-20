import { Router } from "express";
import { config, updateConfig, summary, redeem, adjust } from "../controllers/loyaltyController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();
r.use(requireAuth, requireTenant, requireFeature("loyalty"));
r.get("/config", requirePermission("loyalty.view"), config);
r.put("/config", requirePermission("loyalty.manage"), updateConfig);
r.get("/customers/:id", requirePermission("loyalty.view"), summary);
r.post("/customers/:id/redeem", requirePermission("loyalty.manage"), redeem);
r.post("/customers/:id/adjust", requirePermission("loyalty.manage"), adjust);
export default r;
