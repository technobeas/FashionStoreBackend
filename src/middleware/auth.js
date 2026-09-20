import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.admin_token;
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    const payload = jwt.verify(token, env.JWT_SECRET);
    const admin = await Admin.findById(payload.sub).select("username role tenantId permissions active lastLoginAt createdAt");
    if (!admin || !admin.active) return res.status(401).json({ message: "Unauthorized" });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ message: "Session expired or invalid" });
  }
}
