import Tenant from "../models/Tenant.js";
import { env } from "../config/env.js";
import { getRequestHostname, isPlatformHostname, resolveTenantByHostname } from "../services/domainResolver.js";
import { enforceTenantIsolation } from "./tenantIsolation.js";

function isAvailable(tenant) {
  if (!tenant) return false;
  if (["suspended", "cancelled"].includes(tenant.status)) return false;
  if (tenant.status === "trial" && tenant.subscription?.trialEndsAt && new Date(tenant.subscription.trialEndsAt) <= new Date()) return false;
  return true;
}

/** Resolve tenant for authenticated/admin requests from the authenticated admin only. */
export async function requireTenant(req, res, next) {
  if (!req.admin?.tenantId) return res.status(403).json({ message: "Tenant context is required." });
  const tenant = await Tenant.findOne({ _id: req.admin.tenantId }).lean();
  if (!tenant) return res.status(403).json({ message: "Tenant is unavailable." });
  if (!isAvailable(tenant)) {
    const message = ["suspended", "cancelled"].includes(tenant.status)
      ? "This store is unavailable."
      : "Your trial has expired. Please contact the platform administrator to continue.";
    return res.status(tenant.status === "trial" ? 402 : 403).json({ message });
  }
  req.tenant = tenant;
  req.tenantResolution = { source: "authenticated", hostname: getRequestHostname(req) };
  return enforceTenantIsolation(req, res, next);
}

/**
 * Public tenant resolution.
 * Priority:
 * 1) explicit /shop/:tenantSlug route param
 * 2) an active custom-domain/subdomain host
 * 3) X-Tenant-Slug/query/default slug on platform hosts
 *
 * A tenant domain is never allowed to be overridden by a stale public header.
 */
export async function resolvePublicTenant(req, res, next) {
  try {
    const explicitSlug = String(req.params.tenantSlug || "").trim().toLowerCase();
    let tenant = null;
    let source = "";

    if (explicitSlug) {
      tenant = await Tenant.findOne({ slug: explicitSlug }).lean();
      source = "slug";
    } else {
      const hostname = getRequestHostname(req);
      if (!isPlatformHostname(hostname)) {
        const resolved = await resolveTenantByHostname(hostname);
        if (resolved) {
          tenant = resolved.tenant;
          req.tenantDomain = resolved.domain;
          source = resolved.domain?.type === "custom" ? "custom-domain" : "subdomain";
        }
      }

      if (!tenant) {
        const slug = String(req.headers["x-tenant-slug"] || req.query.tenantSlug || env.DEFAULT_TENANT_SLUG || "").trim().toLowerCase();
        if (slug) {
          tenant = await Tenant.findOne({ slug }).lean();
          source = "header";
        }
      }
    }

    if (!tenant) return res.status(404).json({ message: "Store not found." });
    if (!isAvailable(tenant)) return res.status(404).json({ message: "Store not found." });

    req.tenant = tenant;
    req.tenantResolution = { source, hostname: getRequestHostname(req), domain: req.tenantDomain || null };
    next();
  } catch (error) {
    next(error);
  }
}
