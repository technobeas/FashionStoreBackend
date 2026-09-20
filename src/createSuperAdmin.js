import bcrypt from "bcryptjs";
import Admin from "./models/Admin.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";

await connectDB();
const username = env.SUPER_ADMIN_USERNAME.toLowerCase().trim();
const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12);
const existing = await Admin.findOne({ username });
if (existing) {
  existing.passwordHash = passwordHash;
  existing.role = "super_admin";
  existing.tenantId = null;
  existing.permissions = ["*"];
  existing.active = true;
  await existing.save();
  console.log(`Updated super admin: ${username}`);
} else {
  await Admin.create({ username, passwordHash, role: "super_admin", tenantId: null, permissions: ["*"], active: true });
  console.log(`Created super admin: ${username}`);
}
process.exit(0);
