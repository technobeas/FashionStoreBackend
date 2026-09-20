import bcrypt from "bcryptjs";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import Admin from "./models/Admin.js";

/*
 * Platform Admin seed
 *
 * This intentionally uses environment credentials instead of hard-coded
 * credentials. Run: npm run seed:platform
 *
 * Required:
 *   SUPER_ADMIN_USERNAME
 *   SUPER_ADMIN_PASSWORD
 *
 * The operation is idempotent: an existing account with the same username
 * is promoted/reset as the platform super admin. No tenant is created.
 */

await connectDB();

const username = env.SUPER_ADMIN_USERNAME.toLowerCase().trim();
const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12);

const admin = await Admin.findOneAndUpdate(
  { username },
  {
    username,
    passwordHash,
    role: "super_admin",
    tenantId: null,
    permissions: ["*"],
    active: true,
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

console.log(`Platform admin ready: ${admin.username}`);
console.log("Role: super_admin");
console.log("Tenant: none (platform-level account)");
process.exit(0);
