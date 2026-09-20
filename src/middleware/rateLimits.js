import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "node:crypto";

function fingerprint(req, scope = "global") {
  const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
  const ua = String(req.get("user-agent") || "unknown");
  const host = String(req.get("host") || "unknown").toLowerCase();
  const identity = String(req.body?.email || req.body?.username || req.admin?._id || "anonymous").trim().toLowerCase();
  return crypto.createHash("sha256").update(`${scope}|${ip}|${ua}|${host}|${identity}`).digest("hex");
}

const common = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => fingerprint(req)
};

export const authRateLimit = rateLimit({
  ...common,
  keyGenerator: (req) => fingerprint(req, "auth"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many authentication attempts. Please try again later." }
});

export const registerRateLimit = rateLimit({
  ...common,
  keyGenerator: (req) => fingerprint(req, "register"),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: "Too many registration attempts. Please try again later." }
});

export const sensitiveRateLimit = rateLimit({
  ...common,
  keyGenerator: (req) => fingerprint(req, "sensitive"),
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { message: "Too many requests. Please try again later." }
});

export const publicWriteRateLimit = rateLimit({
  ...common,
  keyGenerator: (req) => fingerprint(req, "public-write"),
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: { message: "Too many requests. Please try again later." }
});
