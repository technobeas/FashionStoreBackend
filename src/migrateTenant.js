import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import Admin from "./models/Admin.js";
import Tenant from "./models/Tenant.js";
import Product from "./models/Product.js";
import Category from "./models/Category.js";
import Order from "./models/Order.js";
import Return from "./models/Return.js";
import Notification from "./models/Notification.js";
import PushSubscription from "./models/PushSubscription.js";
import ShopSettings from "./models/ShopSettings.js";
import FashionSize from "./models/FashionSize.js";

await connectDB();

const slug = env.DEFAULT_TENANT_SLUG;
let tenant = await Tenant.findOne({ slug });
if (!tenant) {
  tenant = await Tenant.create({ name: "JD COLLECTION", slug, status: "active", plan: "starter" });
}

const tenantId = tenant._id;
const discoveredSizes = await Product.aggregate([
  { $match: { tenantId } },
  { $project: { sizes: { $ifNull: ["$sizes", []] } } },
  { $unwind: "$sizes" },
  { $group: { _id: "$sizes" } }
]);
const legacySizes = discoveredSizes.map(x => String(x._id).trim()).filter(Boolean);
const defaultSizes = [
  ["Extra Small","XS"],["Small","S"],["Medium","M"],["Large","L"],["Extra Large","XL"],
  ["2X Large","XXL"],["3X Large","3XL"],["4X Large","4XL"],["Free Size","FREE SIZE"]
];
for (const [name,key] of defaultSizes) {
  await FashionSize.updateOne({tenantId,key},{$setOnInsert:{tenantId,name,key,isActive:true,sortOrder:defaultSizes.findIndex(x=>x[1]===key)}},{upsert:true});
}
for (const value of legacySizes) {
  const key=value.toUpperCase();
  await FashionSize.updateOne({tenantId,key},{$setOnInsert:{tenantId,name:value,key,isActive:true,sortOrder:100}},{upsert:true});
}
console.log(`Fashion sizes migrated: ${legacySizes.length} legacy values discovered`);

const obsoleteIndexes = [
  [Product, "slug_1"], [Product, "sku_1"],
  [Category, "slug_1"], [Order, "orderNumber_1"], [Return, "returnNumber_1"],
  [PushSubscription, "endpoint_1"], [ShopSettings, "singleton_1"]
];
for (const [Model, indexName] of obsoleteIndexes) {
  try { await Model.collection.dropIndex(indexName); } catch {}
}
const models = [Product, Category, Order, Return, Notification, PushSubscription, ShopSettings];
for (const Model of models) {
  const result = await Model.updateMany(
    { tenantId: { $exists: false } },
    { $set: { tenantId } }
  );
  console.log(`${Model.modelName}: migrated ${result.modifiedCount} documents`);
}

const admin = await Admin.findOne({ username: env.ADMIN_USERNAME.toLowerCase() });
if (admin) {
  admin.tenantId = tenantId;
  if (admin.role === "admin") admin.role = "owner";
  await admin.save();
  tenant.owner = admin._id;
  await tenant.save();
  console.log(`Admin ${admin.username} assigned to ${tenant.slug}`);
}

console.log(`Tenant migration complete: ${tenant.name} (${tenant.slug})`);
await mongoose.disconnect();
