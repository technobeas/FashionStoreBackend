import {Router} from "express";
import {list,get,create,update,remove} from "../controllers/supplierController.js";
import {requireAuth} from "../middleware/auth.js"; import {requireTenant} from "../middleware/tenant.js";
import {requirePermission} from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";
const r=Router();r.use(requireAuth,requireTenant,requireFeature("suppliers"));
r.get("/",requirePermission("suppliers.view"),list);r.get("/:id",requirePermission("suppliers.view"),get);
r.post("/",requirePermission("suppliers.create"),create);r.put("/:id",requirePermission("suppliers.edit"),update);r.delete("/:id",requirePermission("suppliers.edit"),remove);
export default r;