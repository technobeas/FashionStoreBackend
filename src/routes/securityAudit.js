import { Router } from "express";
import { run } from "../controllers/securityAuditController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

const r = Router();
r.get("/tenant-isolation", requireAuth, requireTenant, run);
export default r;
