import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/superAdmin.js";
import { createTenant, dashboard, listTenants, getTenant, updateTenantStatus, updateTenantPlan, updateTenantFeatures, updateTenantSubscription, updateDeveloperBranding, listPlans, updatePlan } from "../controllers/superAdminController.js";

const r = Router();
r.use(requireAuth, requireSuperAdmin);
r.post("/tenants", createTenant);
r.get("/dashboard", dashboard);
r.get("/tenants", listTenants);
r.get("/tenants/:id", getTenant);
r.patch("/tenants/:id/status", updateTenantStatus);
r.patch("/tenants/:id/plan", updateTenantPlan);
r.patch("/tenants/:id/features", updateTenantFeatures);
r.patch("/tenants/:id/subscription", updateTenantSubscription);
r.patch("/tenants/:id/developer-branding", updateDeveloperBranding);
r.get("/plans", listPlans);
r.patch("/plans/:code", updatePlan);
export default r;
