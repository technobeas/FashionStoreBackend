import Tenant from "../models/Tenant.js";
import TenantDomain from "../models/TenantDomain.js";
import ShopSettings from "../models/ShopSettings.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Collection from "../models/Collection.js";
import { env } from "../config/env.js";
import { getRequestHostname, isPlatformHostname, normalizeHostname } from "../services/domainResolver.js";

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
  const host = getRequestHostname(req);
  return `${proto}://${host}`;
}

function tenantOrigin(req, tenant) {
  const host = getRequestHostname(req);
  if (!isPlatformHostname(host)) return requestOrigin(req);
  return `${requestOrigin(req)}/shop/${tenant.slug}`;
}

function tenantUrl(req, tenant, path = "") {
  const base = tenantOrigin(req, tenant).replace(/\/$/, "");
  return `${base}${path || "/"}`;
}

function activeTenantFilter() {
  return { status: { $in: ["active", "trial"] } };
}

export async function tenantSitemap(req, res) {
  const tenant = req.tenant;
  const [products, categories, collections] = await Promise.all([
    Product.find({ tenantId: tenant._id, isAvailable: true }).select("slug updatedAt").sort({ updatedAt: -1 }).lean(),
    Category.find({ tenantId: tenant._id, isActive: true }).select("slug updatedAt").sort({ updatedAt: -1 }).lean(),
    Collection.find({ tenantId: tenant._id, isActive: true }).select("slug updatedAt").sort({ updatedAt: -1 }).lean()
  ]);

  const urls = [
    [tenantUrl(req, tenant), new Date(tenant.updatedAt || Date.now())],
    [tenantUrl(req, tenant, "/categories"), null],
    [tenantUrl(req, tenant, "/collections"), null],
    ...categories.map((x) => [tenantUrl(req, tenant, `/categories/${encodeURIComponent(x.slug)}`), x.updatedAt]),
    ...collections.map((x) => [tenantUrl(req, tenant, `/collections/${encodeURIComponent(x.slug)}`), x.updatedAt]),
    ...products.map((x) => [tenantUrl(req, tenant, `/products/${encodeURIComponent(x.slug)}`), x.updatedAt])
  ];

  const body = urls.map(([loc, lastmod]) => `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ""}</url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
  res.set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" });
  res.send(xml);
}

export async function sitemapIndex(req, res) {
  const tenants = await Tenant.find(activeTenantFilter()).select("slug updatedAt").sort({ createdAt: 1 }).lean();
  const host = getRequestHostname(req);
  const items = tenants.map((tenant) => {
    const loc = !isPlatformHostname(host)
      ? tenantUrl(req, tenant, "/sitemap.xml")
      : `${requestOrigin(req)}/shop/${encodeURIComponent(tenant.slug)}/sitemap.xml`;
    return `<sitemap><loc>${xmlEscape(loc)}</loc>${tenant.updatedAt ? `<lastmod>${new Date(tenant.updatedAt).toISOString()}</lastmod>` : ""}</sitemap>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
  res.set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" });
  res.send(xml);
}

export async function robots(req, res) {
  const host = normalizeHostname(getRequestHostname(req));
  const platform = isPlatformHostname(host);
  let sitemapUrl = `${requestOrigin(req)}/sitemap-index.xml`;
  if (!platform && req.tenant) sitemapUrl = `${requestOrigin(req)}/sitemap.xml`;
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /super-admin",
    "Disallow: /api/",
    "Disallow: /register",
    "Disallow: /login",
    "Disallow: /checkout",
    "Disallow: /track-order",
    `Sitemap: ${sitemapUrl}`
  ];
  res.set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" });
  res.send(lines.join("\n") + "\n");
}

export async function seoMeta(req, res) {
  const tenant = req.tenant;
  const settings = await ShopSettings.findOne({ tenantId: tenant._id }).lean();
  const shopName = settings?.shopName || tenant.name || "Ladies Fashion Store";
  const description = settings?.description || `Discover beautiful ladies fashion at ${shopName}.`;
  const logo = settings?.branding?.logo?.secureUrl || settings?.branding?.favicon?.secureUrl || tenant.logo?.secureUrl || "";
  const canonical = tenantUrl(req, tenant);
  res.json({
    tenant: { id: tenant._id, slug: tenant.slug, name: tenant.name },
    title: shopName,
    description,
    image: logo,
    canonical,
    sitemap: `${canonical.replace(/\/$/, "")}/sitemap.xml`
  });
}
