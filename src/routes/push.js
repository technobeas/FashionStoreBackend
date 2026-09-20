import { Router } from "express";
import { publicKey, subscribe, unsubscribe, status } from "../controllers/pushController.js";
import { resolvePublicTenant } from "../middleware/tenant.js";
const r = Router();
r.get("/public-key", publicKey);
r.get("/status", resolvePublicTenant, status);
r.post("/subscribe", resolvePublicTenant, subscribe);
r.delete("/unsubscribe", resolvePublicTenant, unsubscribe);
export default r;
