import { Router } from "express";
import { robots, sitemapIndex, tenantSitemap, seoMeta } from "../controllers/seoController.js";
import { resolvePublicTenant } from "../middleware/tenant.js";

const r = Router();
r.get("/robots.txt", robots);
r.get("/sitemap-index.xml", sitemapIndex);
r.get("/sitemap.xml", resolvePublicTenant, tenantSitemap);
r.get("/meta", resolvePublicTenant, seoMeta);
r.get("/:tenantSlug/robots.txt", resolvePublicTenant, robots);
r.get("/:tenantSlug/sitemap.xml", resolvePublicTenant, tenantSitemap);
r.get("/:tenantSlug/meta", resolvePublicTenant, seoMeta);

export default r;
