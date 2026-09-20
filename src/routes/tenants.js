import { Router } from "express";
import {
  publicStore, publicManifest, resolveHost,
  listDomains, addDomain, verifyDomain, setPrimaryDomain, disableDomain
} from "../controllers/tenantController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant, resolvePublicTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();

r.get("/resolve", resolvePublicTenant, resolveHost);
r.get("/manifest.webmanifest", resolvePublicTenant, publicManifest);

r.get("/domains/list", requireAuth, requireTenant, requireFeature("domains"), requirePermission("domains.view"), listDomains);
r.post("/domains", requireAuth, requireTenant, requireFeature("domains"), requirePermission("domains.manage"), addDomain);
r.post("/domains/:id/verify", requireAuth, requireTenant, requireFeature("domains"), requirePermission("domains.manage"), verifyDomain);
r.post("/domains/:id/primary", requireAuth, requireTenant, requireFeature("domains"), requirePermission("domains.manage"), setPrimaryDomain);
r.post("/domains/:id/disable", requireAuth, requireTenant, requireFeature("domains"), requirePermission("domains.manage"), disableDomain);

r.get("/:tenantSlug/manifest.webmanifest", resolvePublicTenant, publicManifest);
r.get("/:tenantSlug", resolvePublicTenant, publicStore);

export default r;
