import { Router } from "express";
import { list, create, send, cancel, deliveries } from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();

r.get("/", requireAuth, requireTenant, requireFeature("notifications"), requirePermission("notifications.view"), list);
r.post("/", requireAuth, requireTenant, requireFeature("notifications"), requirePermission("notifications.create"), create);
r.post("/:id/send", requireAuth, requireTenant, requireFeature("notifications"), requirePermission("notifications.create"), send);
r.post("/:id/cancel", requireAuth, requireTenant, requireFeature("notifications"), requirePermission("notifications.create"), cancel);
r.get("/:id/deliveries", requireAuth, requireTenant, requireFeature("notifications"), requirePermission("notifications.view"), deliveries);

export default r;
