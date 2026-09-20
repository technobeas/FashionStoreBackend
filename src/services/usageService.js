import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Admin from "../models/Admin.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Usage from "../models/Usage.js";

function periodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function measureTenantUsage(tenantId, date = new Date()) {
  const [products, variants, staff, customers, orders, productStorage, variantStorage] = await Promise.all([
    Product.countDocuments({ tenantId }),
    ProductVariant.countDocuments({ tenantId }),
    Admin.countDocuments({ tenantId, role: { $ne: "owner" } }),
    Customer.countDocuments({ tenantId }),
    Order.countDocuments({ tenantId }),
    Product.aggregate([
      { $match: { tenantId } },
      { $project: {
        imageBytes: { $sum: { $map: { input: { $ifNull: ["$images", []] }, as: "m", in: { $ifNull: ["$$m.bytes", 0] } } } },
        videoBytes: { $sum: { $map: { input: { $ifNull: ["$videos", []] }, as: "m", in: { $ifNull: ["$$m.bytes", 0] } } } }
      } },
      { $group: { _id: null, bytes: { $sum: { $add: ["$imageBytes", "$videoBytes"] } } } }
    ]),
    ProductVariant.aggregate([
      { $match: { tenantId } },
      { $project: { bytes: { $ifNull: ["$image.bytes", 0] } } },
      { $group: { _id: null, bytes: { $sum: "$bytes" } } }
    ])
  ]);

  const usage = {
    tenantId,
    period: periodKey(date),
    products,
    variants,
    staff,
    customers,
    orders,
    storageBytes: Number(productStorage[0]?.bytes || 0) + Number(variantStorage[0]?.bytes || 0),
    measuredAt: new Date()
  };

  return Usage.findOneAndUpdate(
    { tenantId, period: usage.period },
    { $set: usage },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function getTenantUsageHistory(tenantId, limit = 12) {
  return Usage.find({ tenantId }).sort({ period: -1 }).limit(limit).lean();
}
