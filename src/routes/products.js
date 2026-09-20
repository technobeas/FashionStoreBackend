import { Router } from "express";
import {
  listPublic,
  getPublic,
  listAdmin,
  getAdmin,
  create,
  update,
  remove,
  deleteMedia,
} from "../controllers/productController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, resolvePublicTenant } from "../middleware/tenant.js";
import { mediaUpload } from "../middleware/upload.js";
import {
  requirePlanCapacity,
  requireFeature,
} from "../middleware/planLimits.js";
import { requirePermission } from "../middleware/permissions.js";

const r = Router();

r.get(
  "/admin/list",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.view"),
  listAdmin,
);
r.get(
  "/admin/:id",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.view"),
  getAdmin,
);

r.get("/", resolvePublicTenant, requireFeature("catalog"), listPublic);
r.get("/:slug", resolvePublicTenant, requireFeature("catalog"), getPublic);

r.post(
  "/",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.create"),
  requirePlanCapacity("products"),
  mediaUpload.array("media", 12),
  create,
);
r.put(
  "/:id",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.edit"),
  mediaUpload.array("media", 12),
  update,
);
r.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.delete"),
  remove,
);
r.delete(
  "/:id/media",
  requireAuth,
  requireTenant,
  requireFeature("catalog"),
  requirePermission("products.edit"),
  deleteMedia,
);

export default r;
