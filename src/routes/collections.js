import { Router } from "express";
import { list, getPublic, create, update, remove } from "../controllers/collectionController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, resolvePublicTenant } from "../middleware/tenant.js";
import { mediaUpload } from "../middleware/upload.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();

r.get("/", resolvePublicTenant, list);
r.get("/:slug", resolvePublicTenant, getPublic);

r.post("/", requireAuth, requireTenant, requireFeature("collections"), requirePermission("collections.create"), mediaUpload.single("image"), create);
r.put("/:id", requireAuth, requireTenant, requireFeature("collections"), requirePermission("collections.edit"), mediaUpload.single("image"), update);
r.delete("/:id", requireAuth, requireTenant, requireFeature("collections"), requirePermission("collections.delete"), remove);

export default r;
