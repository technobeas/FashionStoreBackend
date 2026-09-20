import crypto from "crypto";
import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = new Set(["/api/auth/login", "/api/auth/register", "/api/health"]);

function cookieOptions() {
  return {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : env.COOKIE_SAME_SITE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

export function csrfProtection(req, res, next) {
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, cookieOptions());
  }

  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();

  // Only browser sessions authenticated by the admin cookie need CSRF protection.
  // Public unauthenticated POST/DELETE endpoints (e.g. push subscription) remain usable.
  if (!req.cookies?.admin_token) return next();

  const header = req.get("x-csrf-token");
  const headerBuffer = Buffer.from(String(header));
  const tokenBuffer = Buffer.from(String(token));
  if (headerBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(headerBuffer, tokenBuffer)) {
    return res.status(403).json({ message: "CSRF validation failed." });
  }
  next();
}
