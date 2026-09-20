import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Notification from "../models/Notification.js";
import Order from "../models/Order.js";
import Return from "../models/Return.js";
import Expense from "../models/Expense.js";

export async function dashboard(req, res) {
  const [
    totalProducts, availableProducts, outOfStock, todaysOffers,
    mostDemanded, totalCategories, notificationsSent
  ] = await Promise.all([
    Product.countDocuments({ tenantId: req.tenant._id }),
    Product.countDocuments({ tenantId: req.tenant._id, isAvailable: true }),
    Product.countDocuments({ tenantId: req.tenant._id, isAvailable: false }),
    Product.countDocuments({ tenantId: req.tenant._id, isTodaysOffer: true }),
    Product.countDocuments({ tenantId: req.tenant._id, isMostDemanded: true }),
    Category.countDocuments({ tenantId: req.tenant._id }),
    Notification.countDocuments({ tenantId: req.tenant._id, status: { $in: ["sent", "partial"] } })
  ]);

  const [orderFinancial, returnFinancial, expenseFinancial] = await Promise.all([
    Order.aggregate([
      { $match: { tenantId: req.tenant._id, status: "paid" } },
      { $group: {
        _id: null,
        revenue: { $sum: "$finalTotal" },
        discounts: { $sum: "$discountAmount" },
        productDiscounts: { $sum: { $ifNull: ["$productDiscountAmount", 0] } },
        additionalDiscounts: { $sum: { $ifNull: ["$additionalDiscountAmount", 0] } },
        profit: { $sum: "$profit" },
        orders: { $sum: 1 }
      }}
    ]),
    Return.aggregate([{ $match: { tenantId: req.tenant._id } }, { $group: {
      _id: null,
      amount: { $sum: "$returnAmount" },
      cost: { $sum: "$totalCost" },
      profitImpact: { $sum: "$profitImpact" },
      returns: { $sum: 1 }
    }}]),
    Expense.aggregate([{ $match: { tenantId: req.tenant._id, date: { $gte: new Date(new Date().setHours(0,0,0,0)), $lte: new Date(new Date().setHours(23,59,59,999)) } } }, { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } }])
  ]);

  const gross = orderFinancial[0] || { revenue: 0, discounts: 0, productDiscounts: 0, additionalDiscounts: 0, profit: 0, orders: 0 };
  const returned = returnFinancial[0] || { amount: 0, cost: 0, profitImpact: 0, returns: 0 };
  const netRevenue = Math.round((gross.revenue - returned.amount) * 100) / 100;
  const expensesToday = Number(expenseFinancial[0]?.amount || 0);
  const netProfit = Math.round((gross.profit - returned.profitImpact - expensesToday) * 100) / 100;

  const financial = await Product.aggregate([{ $match: { tenantId: req.tenant._id } },
    { $project: {
      purchase: { $ifNull: ["$purchasePrice", 0] },
      selling: { $ifNull: ["$sellingPrice", 0] },
      discounted: { $ifNull: ["$discountedPrice", "$sellingPrice"] },
      quantity: { $ifNull: ["$stockQuantity", 1] },
      available: "$isAvailable"
    }},
    { $group: {
      _id: null,
      inventoryPurchaseValue: { $sum: { $cond: ["$available", { $multiply: ["$purchase", "$quantity"] }, 0] } },
      potentialSalesValue: { $sum: { $cond: ["$available", { $multiply: ["$selling", "$quantity"] }, 0] } },
      normalProfit: { $sum: { $cond: ["$available", { $multiply: [{ $subtract: ["$selling", "$purchase"] }, "$quantity"] }, 0] } },
      discountedProfit: { $sum: { $cond: ["$available", { $multiply: [{ $subtract: ["$discounted", "$purchase"] }, "$quantity"] }, 0] } }
    }}
  ]);

  res.json({
    counts: { totalProducts, availableProducts, outOfStock, todaysOffers, mostDemanded, totalCategories, notificationsSent },
    financial: financial[0] || {},
    revenue: {
    ...gross,
    returnedAmount: returned.amount,
    returnedCost: returned.cost,
    returnedProfitImpact: returned.profitImpact,
    returns: returned.returns,
    expensesToday,
    expenseCountToday: expenseFinancial[0]?.count || 0,
    netRevenue,
    netProfit
  }
  });
}
