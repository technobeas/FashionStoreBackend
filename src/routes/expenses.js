import { Router } from "express";
import { list, get, create, update, remove, summary } from "../controllers/expenseController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";

const r = Router();
r.use(requireAuth, requireTenant, requireFeature("expenses"));
r.get("/summary", requirePermission("expenses.view"), summary);
r.get("/", requirePermission("expenses.view"), list);
r.get("/:id", requirePermission("expenses.view"), get);
r.post("/", requirePermission("expenses.manage"), create);
r.put("/:id", requirePermission("expenses.manage"), update);
r.delete("/:id", requirePermission("expenses.manage"), remove);

export default r;
