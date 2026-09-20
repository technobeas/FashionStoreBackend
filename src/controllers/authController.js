import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import Tenant from "../models/Tenant.js";
import { env } from "../config/env.js";
import ShopSettings from "../models/ShopSettings.js";
import { slugify } from "../utils/slug.js";

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : env.COOKIE_SAME_SITE,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};

export async function login(req, res) {
  const { username, password, tenantSlug } = req.body;
  const normalizedUsername = String(username || "").toLowerCase().trim();
  const adminQuery = { username: normalizedUsername };
  if (tenantSlug) {
    const tenant = await Tenant.findOne({ slug: String(tenantSlug).toLowerCase().trim(), status: { $in: ["active", "trial"] } });
    if (!tenant) return res.status(404).json({ message: "Store not found." });
    if (tenant.status === "trial" && tenant.subscription?.trialEndsAt && new Date(tenant.subscription.trialEndsAt) <= new Date()) {
      return res.status(402).json({ message: "Your trial has expired." });
    }
    adminQuery.tenantId = tenant._id;
  }
  const admin = await Admin.findOne(adminQuery).select("+passwordHash");
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (!admin.active) return res.status(403).json({ message: "This account is inactive." });

  req.auditActor = admin;
  req.auditTenantId = admin.tenantId || null;
  admin.lastLoginAt = new Date();
  await admin.save();

  const token = jwt.sign(
    { sub: admin._id.toString(), role: admin.role, tenantId: admin.tenantId?.toString() || null },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
  res.cookie("admin_token", token, cookieOptions);
  const tenant = admin.tenantId ? await Tenant.findById(admin.tenantId).select("name slug status plan logo").lean() : null;
  res.json({ admin: { id: admin._id, username: admin.username, role: admin.role, tenantId: admin.tenantId, permissions: admin.permissions, tenant } });
}


export async function register(req, res) {
  return res.status(403).json({ message: "Shop registration is available only to the Platform Admin." });
}

export async function logout(req, res) {
  res.clearCookie("admin_token", { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: env.NODE_ENV === "production" ? "none" : env.COOKIE_SAME_SITE, path: "/" });
  res.json({ message: "Logged out" });
}

export function me(req, res) {
  res.json({ admin: req.admin });
}
