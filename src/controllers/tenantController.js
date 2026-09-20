import Tenant from "../models/Tenant.js";
import ShopSettings from "../models/ShopSettings.js";
import TenantDomain from "../models/TenantDomain.js";
import { resolveTxt } from "node:dns/promises";
import { createVerificationToken, normalizeHostname, isPlatformHostname } from "../services/domainResolver.js";
import { env } from "../config/env.js";

export async function publicStore(req, res) {
  const tenant = req.tenant;
  const settings = await ShopSettings.findOne({ tenantId: tenant._id }).lean();
  res.json({
    tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug, logo: tenant.logo, plan: tenant.plan, developerBranding: tenant.developerBranding || null },
    settings: settings || null,
    storeUrl: req.tenantResolution?.source === "custom-domain" || req.tenantResolution?.source === "subdomain" ? "/" : `/shop/${tenant.slug}`,
    seo: { sitemap: `/seo/${encodeURIComponent(tenant.slug)}/sitemap.xml`, robots: `/seo/${encodeURIComponent(tenant.slug)}/robots.txt` }
  });
}


export async function publicManifest(req, res) {
  const tenant = req.tenant;
  const settings = await ShopSettings.findOne({ tenantId: tenant._id }).lean();
  const name = settings?.shopName || tenant.name || "Ladies Fashion Store";
  const description = settings?.description || `Browse ${name} online.`;
  const icon = settings?.branding?.favicon?.secureUrl || settings?.branding?.logo?.secureUrl || settings?.logo?.secureUrl || tenant.logo?.secureUrl || "";
  const themeColor = settings?.branding?.primaryColor || "#111827";
  const source = req.tenantResolution?.source;
  const isDomainStore = source === "custom-domain" || source === "subdomain";
  const startUrl = isDomainStore ? "/" : `/shop/${tenant.slug}/`;
  const manifest = {
    id: startUrl,
    name,
    short_name: name.slice(0, 32),
    description,
    start_url: startUrl,
    scope: isDomainStore ? "/" : `/shop/${tenant.slug}/`,
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fffdf7",
    theme_color: themeColor,
    lang: "en-IN",
    dir: "ltr",
    categories: ["shopping", "fashion", "lifestyle"],
    prefer_related_applications: false,
    icons: icon ? [
      { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ] : []
  };
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.type("application/manifest+json").json(manifest);
}


export async function resolveHost(req, res) {
  const tenant = req.tenant;
  if (!tenant) return res.status(404).json({ message: "Store not found." });
  const settings = await ShopSettings.findOne({ tenantId: tenant._id }).lean();
  res.json({
    tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug, logo: tenant.logo, plan: tenant.plan, developerBranding: tenant.developerBranding || null },
    settings: settings || null,
    resolution: req.tenantResolution || null,
    storeUrl: req.tenantResolution?.source === "slug" ? `/shop/${tenant.slug}` : "/"
  });
}

export async function listDomains(req, res) {
  const domains = await TenantDomain.find({ tenantId: req.tenant._id }).sort({ isPrimary: -1, createdAt: 1 }).lean();
  res.json({ domains });
}

export async function addDomain(req, res) {
  if (!env.ALLOW_CUSTOM_DOMAINS) return res.status(403).json({ message: "Custom domains are disabled." });
  const hostname = normalizeHostname(req.body.hostname);
  const type = String(req.body.type || "custom").toLowerCase();
  if (!hostname || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname)) {
    return res.status(400).json({ message: "Enter a valid domain name." });
  }
  if (isPlatformHostname(hostname)) return res.status(400).json({ message: "The platform domain cannot be assigned to a store." });
  if (!["custom", "subdomain"].includes(type)) return res.status(400).json({ message: "Invalid domain type." });

  const existing = await TenantDomain.findOne({ hostname });
  if (existing && String(existing.tenantId) !== String(req.tenant._id)) {
    return res.status(409).json({ message: "This domain is already assigned to another store." });
  }
  if (existing) return res.json({ domain: existing });

  const count = await TenantDomain.countDocuments({ tenantId: req.tenant._id });
  const domain = await TenantDomain.create({
    tenantId: req.tenant._id,
    hostname,
    type,
    status: type === "subdomain" || !env.CUSTOM_DOMAIN_REQUIRE_VERIFICATION ? "active" : "pending",
    isPrimary: count === 0,
    verificationToken: type === "custom" && env.CUSTOM_DOMAIN_REQUIRE_VERIFICATION ? createVerificationToken() : null,
    verifiedAt: type === "custom" && env.CUSTOM_DOMAIN_REQUIRE_VERIFICATION ? null : new Date(),
  });
  res.status(201).json({
    domain,
    verification: domain.status === "pending" ? {
      type: "dns-txt",
      host: `_noorie-verification.${hostname}`,
      value: domain.verificationToken,
      note: "Create the TXT record at your DNS provider, then use the Verify action."
    } : null
  });
}

export async function verifyDomain(req, res) {
  const domain = await TenantDomain.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!domain) return res.status(404).json({ message: "Domain not found." });
  if (domain.type !== "custom") {
    domain.status = "active";
    domain.verifiedAt = new Date();
    await domain.save();
    return res.json({ domain });
  }
  const recordName = `_noorie-verification.${domain.hostname}`;
  let values = [];
  try {
    const records = await resolveTxt(recordName);
    values = records.flat().map((value) => String(value).trim());
  } catch {
    return res.status(400).json({ message: "DNS TXT record not found yet. Add the verification record and try again." });
  }
  if (!values.includes(String(domain.verificationToken))) {
    return res.status(400).json({ message: "DNS TXT record was found, but the verification token does not match." });
  }
  domain.status = "active";
  domain.verifiedAt = new Date();
  domain.lastVerifiedAt = new Date();
  await domain.save();
  res.json({ domain });
}

export async function setPrimaryDomain(req, res) {
  const domain = await TenantDomain.findOne({ _id: req.params.id, tenantId: req.tenant._id, status: "active" });
  if (!domain) return res.status(404).json({ message: "Active domain not found." });
  await TenantDomain.updateMany({ tenantId: req.tenant._id }, { $set: { isPrimary: false } });
  domain.isPrimary = true;
  await domain.save();
  res.json({ domain });
}

export async function disableDomain(req, res) {
  const domain = await TenantDomain.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!domain) return res.status(404).json({ message: "Domain not found." });
  domain.status = "disabled";
  domain.isPrimary = false;
  await domain.save();
  const replacement = await TenantDomain.findOne({ tenantId: req.tenant._id, status: "active" }).sort({ createdAt: 1 });
  if (replacement) {
    replacement.isPrimary = true;
    await replacement.save();
  }
  res.json({ domain });
}
