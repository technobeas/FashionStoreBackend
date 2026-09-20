import bcrypt from "bcryptjs";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import Admin from "./models/Admin.js";
import Tenant from "./models/Tenant.js";
import Category from "./models/Category.js";
import ShopSettings from "./models/ShopSettings.js";
import Product from "./models/Product.js";

await connectDB();

let tenant = await Tenant.findOne({ slug: env.DEFAULT_TENANT_SLUG });
if (!tenant) tenant = await Tenant.create({ name: "Ladies Fashion Store", slug: env.DEFAULT_TENANT_SLUG, status: "active", plan: "starter" });

const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
const admin = await Admin.findOneAndUpdate(
  { username: env.ADMIN_USERNAME.toLowerCase() },
  { username: env.ADMIN_USERNAME.toLowerCase(), passwordHash, role: "owner", tenantId: tenant._id, active: true },
  { upsert: true, new: true }
);
if (!tenant.owner) { tenant.owner = admin._id; await tenant.save(); }

const categoryNames = ["Kurtis", "Sarees", "Salwar Suits", "Anarkali", "Lehengas", "Gowns", "Dresses", "Tops", "Tunics", "Palazzos", "Sharara", "Co-ord Sets", "Abayas", "Hijabs", "Dupattas", "Nightwear", "Bottom Wear", "Blouses", "Jackets", "Accessories"];
for (let i = 0; i < categoryNames.length; i++) {
  const name = categoryNames[i];
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  await Category.findOneAndUpdate(
    { tenantId: tenant._id, slug },
    { tenantId: tenant._id, name, slug, sortOrder: i, isActive: true },
    { upsert: true, new: true }
  );
}

await ShopSettings.findOneAndUpdate(
  { tenantId: tenant._id },
  {
    tenantId: tenant._id,
    shopName: "Ladies Fashion Store",
    description: "Ladies fashion, dresses and new arrivals."
  },
  { upsert: true, new: true }
);

console.log(`Seed completed for tenant: ${tenant.slug}`);
process.exit(0);
