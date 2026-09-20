import { Router } from "express";
import { list, create, sendNow, cancel, deliveries } from "../controllers/campaignController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();
r.use(requireAuth, requireTenant, requireFeature("campaigns"));
r.get("/", requirePermission("campaigns.view"), list);
r.post("/", requirePermission("campaigns.manage"), create);
r.post("/:id/send", requirePermission("campaigns.manage"), sendNow);
r.post("/:id/cancel", requirePermission("campaigns.manage"), cancel);
r.get("/:id/deliveries", requirePermission("campaigns.view"), deliveries);
export default r;
