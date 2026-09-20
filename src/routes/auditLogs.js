import { Router } from "express";
import { list, summary } from "../controllers/auditController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";

const r = Router();

r.get("/", requireAuth, requireTenant, requirePermission("audit.view"), list);
r.get("/summary", requireAuth, requireTenant, requirePermission("audit.view"), summary);

export default r;
