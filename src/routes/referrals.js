import { Router } from "express";
import { myCode, apply, list } from "../controllers/referralController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";

const r = Router();
r.use(requireAuth, requireTenant);
r.get("/customers/:id/code", requirePermission("customers.view"), myCode);
r.post("/customers/:id/apply", requirePermission("customers.edit"), apply);
r.get("/", requirePermission("campaigns.view"), list);
export default r;
