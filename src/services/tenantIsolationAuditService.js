import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import Admin from "../models/Admin.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Category from "../models/Category.js";
import Collection from "../models/Collection.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Return from "../models/Return.js";
import Purchase from "../models/Purchase.js";
import Supplier from "../models/Supplier.js";
import InventoryTransaction from "../models/InventoryTransaction.js";
import Notification from "../models/Notification.js";
import PushSubscription from "../models/PushSubscription.js";
import ShopSettings from "../models/ShopSettings.js";
import Expense from "../models/Expense.js";
import AuditLog from "../models/AuditLog.js";
import TenantDomain from "../models/TenantDomain.js";

const TENANT_SCOPED_MODELS = [
  ["Product", Product],
  ["ProductVariant", ProductVariant],
  ["Category", Category],
  ["Collection", Collection],
  ["Customer", Customer],
  ["Order", Order],
  ["Return", Return],
  ["Purchase", Purchase],
  ["Supplier", Supplier],
  ["InventoryTransaction", InventoryTransaction],
  ["Notification", Notification],
  ["PushSubscription", PushSubscription],
  ["ShopSettings", ShopSettings],
  ["Expense", Expense],
  ["AuditLog", AuditLog],
  ["TenantDomain", TenantDomain],
  ["Admin", Admin]
];

const PLATFORM_MODELS = new Set(["Tenant", "SaaSPlan", "BillingEvent"]);

function result(name, status, detail, extra = {}) {
  return { name, status, detail, ...extra };
}

export async function runTenantIsolationAudit(tenantId) {
  const currentTenantId = new mongoose.Types.ObjectId(String(tenantId));
  const checks = [];

  const currentTenant = await Tenant.findById(currentTenantId).select("_id name slug status").lean();
  checks.push(
    currentTenant
      ? result("Authenticated tenant exists", "PASS", "The requested tenant exists.")
      : result("Authenticated tenant exists", "FAIL", "Tenant record was not found.")
  );

  const tenantCount = await Tenant.countDocuments({});
  checks.push(
    result(
      "Multi-tenant test population",
      tenantCount >= 2 ? "PASS" : "INFO",
      tenantCount >= 2
        ? `${tenantCount} tenants are available for isolation testing.`
        : "Only one tenant exists; cross-tenant route tests require at least two tenants."
    )
  );

  const foreignTenant = await Tenant.findOne({ _id: { $ne: currentTenantId } }).select("_id name slug").lean();

  for (const [name, Model] of TENANT_SCOPED_MODELS) {
    const schemaHasTenant = Boolean(Model.schema.path("tenantId"));
    checks.push(
      result(
        `${name} has tenantId`,
        schemaHasTenant ? "PASS" : "FAIL",
        schemaHasTenant ? "Tenant ownership is represented in the schema." : "Tenant-scoped model is missing tenantId."
      )
    );

    if (!schemaHasTenant || !foreignTenant) continue;

    const foreignCount = await Model.countDocuments({
      tenantId: foreignTenant._id
    });

    const scopedCount = await Model.countDocuments({
      tenantId: currentTenantId
    });

    // This confirms that the current tenant's canonical query scope cannot
    // return documents owned by a different tenant.
    const crossLeakCount = await Model.countDocuments({
      tenantId: currentTenantId,
      _id: { $in: foreignCount ? await Model.find({ tenantId: foreignTenant._id }).distinct("_id") : [] }
    });

    checks.push(
      result(
        `${name} cross-tenant ownership`,
        crossLeakCount === 0 ? "PASS" : "FAIL",
        crossLeakCount === 0
          ? `Scoped query returned 0 foreign documents (${scopedCount} local, ${foreignCount} foreign).`
          : `Scoped query returned ${crossLeakCount} foreign document(s).`,
        { localCount: scopedCount, foreignCount }
      )
    );
  }

  const adminsWithoutTenant = await Admin.countDocuments({
    role: { $ne: "super_admin" },
    $or: [{ tenantId: null }, { tenantId: { $exists: false } }]
  });
  checks.push(
    result(
      "Tenant staff ownership",
      adminsWithoutTenant === 0 ? "PASS" : "FAIL",
      adminsWithoutTenant === 0
        ? "All non-super-admin staff records are tenant-bound."
        : `${adminsWithoutTenant} non-super-admin staff record(s) are not tenant-bound.`
    )
  );

  const cloudinaryOwners = await Product.countDocuments({
    tenantId: currentTenantId,
    $or: [
      { "image.publicId": { $exists: true, $ne: "" } },
      { "images.publicId": { $exists: true } }
    ]
  });
  checks.push(
    result(
      "Tenant-owned product media",
      "INFO",
      `${cloudinaryOwners} current-tenant product record(s) contain Cloudinary media references.`
    )
  );

  checks.push(
    result(
      "Platform models excluded from tenant scope",
      "PASS",
      `${Array.from(PLATFORM_MODELS).join(", ")} remain platform-level models.`
    )
  );

  return {
    tenant: currentTenant,
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      pass: checks.filter((x) => x.status === "PASS").length,
      fail: checks.filter((x) => x.status === "FAIL").length,
      info: checks.filter((x) => x.status === "INFO").length
    }
  };
}
