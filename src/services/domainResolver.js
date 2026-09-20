import crypto from "crypto";
import TenantDomain from "../models/TenantDomain.js";
import Tenant from "../models/Tenant.js";
import { env } from "../config/env.js";

export function normalizeHostname(value = "") {
  let host = String(value || "").trim().toLowerCase();
  if (!host) return "";
  try {
    if (host.includes("://")) host = new URL(host).hostname;
    else host = new URL(`http://${host}`).hostname;
  } catch {
    host = host.split("/")[0].split(":")[0];
  }
  return host.replace(/\.+$/, "");
}

function configuredDomains() {
  return [env.PLATFORM_DOMAIN, env.PUBLIC_STORE_DOMAIN]
    .map(normalizeHostname)
    .filter(Boolean);
}

export function isPlatformHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  const domains = configuredDomains();
  return domains.includes(host) || host === "localhost" || host === "127.0.0.1";
}

export function subdomainFromHost(hostname) {
  const host = normalizeHostname(hostname);
  for (const base of configuredDomains()) {
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub && !sub.includes(".")) return sub;
    }
  }
  return "";
}

export function getRequestHostname(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.hostname || req.get("host") || "");
  return normalizeHostname(raw.split(",")[0]);
}

export function createVerificationToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function resolveTenantByHostname(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return null;

  const domain = await TenantDomain.findOne({ hostname: host, status: "active" }).lean();
  if (domain) {
    const tenant = await Tenant.findOne({ _id: domain.tenantId }).lean();
    return tenant ? { tenant, domain } : null;
  }

  const subdomain = subdomainFromHost(host);
  if (subdomain) {
    const tenant = await Tenant.findOne({ slug: subdomain }).lean();
    if (tenant) return {
      tenant,
      domain: { hostname: host, type: "subdomain", status: "active", isPrimary: false }
    };
  }

  return null;
}
