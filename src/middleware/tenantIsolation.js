/**
 * Defense-in-depth tenant isolation checks.
 *
 * Authenticated tenant APIs must never accept a caller-supplied tenantId as
 * the authority for scoping. The authenticated tenant is always req.tenant.
 * A mismatching hint is rejected instead of silently switching scope.
 */
function normalizeId(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function collectTenantHints(req) {
  const hints = [];
  const sources = [
    ["body.tenantId", req.body?.tenantId],
    ["query.tenantId", req.query?.tenantId],
    ["header.x-tenant-id", req.headers["x-tenant-id"]]
  ];

  for (const [source, value] of sources) {
    const normalized = normalizeId(value);
    if (normalized) hints.push({ source, value: normalized });
  }

  return hints;
}

export function enforceTenantIsolation(req, res, next) {
  // This middleware is intentionally for authenticated tenant routes.
  // Public storefront requests are resolved by resolvePublicTenant instead.
  if (!req.admin || !req.tenant?._id) return next();

  const tenantId = normalizeId(req.tenant._id);
  const mismatches = collectTenantHints(req).filter((hint) => hint.value !== tenantId);

  if (mismatches.length) {
    return res.status(403).json({
      message: "Tenant scope mismatch.",
      code: "TENANT_SCOPE_MISMATCH"
    });
  }

  // Keep a single server-authoritative scope available to downstream code.
  req.tenantScopeId = tenantId;
  next();
}
