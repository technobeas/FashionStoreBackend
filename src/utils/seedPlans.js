import SaaSPlan from "../models/SaaSPlan.js";

export const DEFAULT_PLANS = [
  { code: "starter", name: "Starter", description: "For small fashion stores.", monthlyPrice: 499, yearlyPrice: 4990, limits: { products: 100, variants: 500, staff: 2, customers: 1000, suppliers: 100, storageMb: 500 }, features: ["catalog", "pos", "customers", "inventory", "sizes"], sortOrder: 1 },
  { code: "growth", name: "Growth", description: "For growing boutiques.", monthlyPrice: 999, yearlyPrice: 9990, limits: { products: 500, variants: 2500, staff: 5, customers: 5000, suppliers: 500, storageMb: 2000 }, features: ["catalog", "pos", "customers", "inventory", "purchases", "suppliers", "reports", "expenses", "staff", "sizes", "collections", "online_orders", "notifications"], sortOrder: 2 },
  { code: "pro", name: "Pro", description: "For high-volume fashion stores.", monthlyPrice: 1999, yearlyPrice: 19990, limits: { products: 2000, variants: 10000, staff: 15, customers: 20000, suppliers: 2000, storageMb: 10000 }, features: ["catalog", "pos", "customers", "inventory", "purchases", "suppliers", "reports", "expenses", "staff", "sizes", "collections", "online_orders", "notifications", "campaigns", "loyalty", "domains", "pwa", "seo", "advanced_analytics"], sortOrder: 3 }
];

export async function ensureDefaultPlans() {
  for (const plan of DEFAULT_PLANS) {
    await SaaSPlan.updateOne({ code: plan.code }, { $setOnInsert: plan }, { upsert: true });
  }
}
