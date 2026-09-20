import AuditLog from "../models/AuditLog.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IGNORED_PATHS = new Set([
  "/api/health",
  "/api/audit-logs"
]);

const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "token", "accessToken", "refreshToken",
  "admin_token", "secret", "apiKey", "privateKey", "vapidPrivateKey"
]);

function clean(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") {
    if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => clean(item, depth + 1));
  const output = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = clean(val, depth + 1);
    }
  }
  return output;
}

function inferAction(req) {
  if (req.path === "/api/auth/login") return "LOGIN";
  if (req.path === "/api/auth/logout") return "LOGOUT";
  if (req.method === "POST") return "CREATE";
  if (req.method === "PUT" || req.method === "PATCH") return "UPDATE";
  if (req.method === "DELETE") return "DELETE";
  return "ACTION";
}

function inferEntity(req) {
  const segments = req.path.split("/").filter(Boolean);
  if (segments[0] === "api") segments.shift();
  const root = segments[0] || "system";
  const entity = root.replace(/[-_]+(.)?/g, (_, c) => c ? c.toUpperCase() : "");
  return entity ? entity.charAt(0).toUpperCase() + entity.slice(1) : "System";
}

function inferEntityId(req) {
  const params = req.params || {};
  return String(params.id || params.productId || params.orderId || params.customerId || params._id || "");
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim().slice(0, 100);
  return String(req.ip || req.socket?.remoteAddress || "").slice(0, 100);
}

/**
 * Captures authenticated/admin mutations after route handlers complete.
 * It intentionally avoids GET noise and never records secrets/passwords.
 * Because it writes on response finish, req.admin/req.tenant populated by
 * route middleware are available even though this middleware is global.
 */
export function auditRequest(req, res, next) {
  const shouldAudit = MUTATING_METHODS.has(req.method) || req.path === "/api/auth/login" || req.path === "/api/auth/logout";
  if (!shouldAudit || IGNORED_PATHS.has(req.path)) return next();

  res.once("finish", () => {
    const admin = req.admin || req.auditActor;
    const action = inferAction(req);
    const body = clean(req.body || {});
    const metadata = {
      requestBody: body,
      query: clean(req.query || {}),
      success: res.statusCode >= 200 && res.statusCode < 400
    };

    AuditLog.create({
      tenantId: req.tenant?._id || req.auditTenantId || admin?.tenantId || null,
      actorId: admin?._id || null,
      actorUsername: admin?.username || String(req.body?.username || "").trim().slice(0, 120),
      actorRole: admin?.role || "",
      action,
      entity: inferEntity(req),
      entityId: inferEntityId(req),
      method: req.method,
      path: req.originalUrl?.split("?")[0] || req.path,
      statusCode: res.statusCode,
      ip: getIp(req),
      userAgent: String(req.get("user-agent") || "").slice(0, 500),
      metadata
    }).catch(error => {
      // Audit failure must never break the already completed business response.
      console.error("Audit log write failed:", error.message);
    });
  });

  next();
}
