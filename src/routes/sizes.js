import { Router } from "express";
import { list, create, update, remove } from "../controllers/sizeController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";
const r=Router();
r.get("/",requireAuth,requireTenant, requireFeature("sizes"),requirePermission("settings.view"),list);
r.post("/",requireAuth,requireTenant, requireFeature("sizes"),requirePermission("settings.edit"),create);
r.put("/:id",requireAuth,requireTenant, requireFeature("sizes"),requirePermission("settings.edit"),update);
r.delete("/:id",requireAuth,requireTenant, requireFeature("sizes"),requirePermission("settings.edit"),remove);
export default r;
