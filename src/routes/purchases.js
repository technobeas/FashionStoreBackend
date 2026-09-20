import {Router} from "express"; import {create,list,get} from "../controllers/purchaseController.js";
import {requireAuth} from "../middleware/auth.js"; import {requireTenant} from "../middleware/tenant.js"; import {requirePermission} from "../middleware/permissions.js"
import { requireFeature } from "../middleware/planLimits.js";
const r=Router();r.use(requireAuth,requireTenant,requireFeature("purchases"));r.get("/",requirePermission("purchases.view"),list);r.get("/:id",requirePermission("purchases.view"),get);r.post("/",requirePermission("purchases.create"),create);export default r;