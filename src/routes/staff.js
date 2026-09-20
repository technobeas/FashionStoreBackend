import {Router} from "express";
import {list,get,create,update,remove,roles} from "../controllers/staffController.js";
import {requireAuth} from "../middleware/auth.js";
import {requireTenant} from "../middleware/tenant.js";
import {requirePermission} from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";
import { requirePlanCapacity } from "../middleware/planLimits.js";
const r=Router();
r.use(requireAuth,requireTenant, requireFeature("staff"),requirePermission("staff.view"));
r.get("/roles",roles);
r.get("/",list);
r.get("/:id",get);
r.post("/",requirePermission("staff.manage"),requirePlanCapacity("staff"),create);
r.put("/:id",requirePermission("staff.manage"),update);
r.delete("/:id",requirePermission("staff.manage"),remove);
export default r;
