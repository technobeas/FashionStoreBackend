import Order from "../models/Order.js";
import Purchase from "../models/Purchase.js";
import Return from "../models/Return.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Customer from "../models/Customer.js";
import Expense from "../models/Expense.js";

function dateRange(query) {
  const now = new Date();
  const end = query.end ? new Date(query.end) : now;
  const start = query.start ? new Date(query.start) : new Date(end.getTime() - 29 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const e = new Error("Invalid report date range."); e.statusCode = 400; throw e;
  }
  if (start > end) { const e = new Error("Report start date cannot be after end date."); e.statusCode = 400; throw e; }
  end.setHours(23,59,59,999); start.setHours(0,0,0,0);
  return { start, end };
}
const round = n => Math.round(Number(n || 0) * 100) / 100;

export async function overview(req,res) {
  const {start,end}=dateRange(req.query);
  const tenantId=req.tenant._id;
  const duration=Math.max(1,end.getTime()-start.getTime()+1);
  const previousEnd=new Date(start.getTime()-1);
  const previousStart=new Date(previousEnd.getTime()-duration+1);
  const dateMatch={tenantId,status:"paid",createdAt:{$gte:start,$lte:end}};
  const previousMatch={tenantId,status:"paid",createdAt:{$gte:previousStart,$lte:previousEnd}};
  const returnMatch={tenantId,createdAt:{$gte:start,$lte:end}};
  const purchaseMatch={tenantId,purchaseDate:{$gte:start,$lte:end}};
  const expenseMatch={tenantId,date:{$gte:start,$lte:end}};

  const [sales,previousSales,returns,purchases,expenses,expenseDays,days,payments,topProducts,topCategories,customers,inventory,lowStock,customerStats,repeatStats,sizes,colors] = await Promise.all([
    Order.aggregate([{$match:dateMatch},{$group:{_id:null,orders:{$sum:1},grossSales:{$sum:"$finalTotal"},discounts:{$sum:"$discountAmount"},cost:{$sum:"$totalCost"},profit:{$sum:"$profit"}}}]),
    Order.aggregate([{$match:previousMatch},{$group:{_id:null,orders:{$sum:1},grossSales:{$sum:"$finalTotal"},profit:{$sum:"$profit"}}}]),
    Return.aggregate([{$match:returnMatch},{$group:{_id:null,returns:{$sum:1},amount:{$sum:"$returnAmount"},cost:{$sum:"$totalCost"},profitImpact:{$sum:"$profitImpact"}}}]),
    Purchase.aggregate([{$match:purchaseMatch},{$group:{_id:null,purchases:{$sum:1},amount:{$sum:"$totalAmount"}}}]),
    Expense.aggregate([{$match:expenseMatch},{$group:{_id:null,count:{$sum:1},amount:{$sum:"$amount"}}}]),
    Expense.aggregate([{$match:expenseMatch},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$date"}},amount:{$sum:"$amount"}}},{$sort:{_id:1}}]),
    Order.aggregate([{$match:dateMatch},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$createdAt"}},orders:{$sum:1},sales:{$sum:"$finalTotal"},profit:{$sum:"$profit"}}},{$sort:{_id:1}}]),
    Order.aggregate([{$match:dateMatch},{$group:{_id:"$paymentMethod",orders:{$sum:1},amount:{$sum:"$finalTotal"}}},{$sort:{amount:-1}}]),
    Order.aggregate([{$match:dateMatch},{$unwind:"$items"},{$group:{_id:{product:"$items.product",name:"$items.name",sku:"$items.sku"},quantity:{$sum:"$items.quantity"},sales:{$sum:"$items.lineTotal"},cost:{$sum:{$multiply:["$items.purchasePrice","$items.quantity"]}},profit:{$sum:{$subtract:["$items.lineTotal",{$multiply:["$items.purchasePrice","$items.quantity"]}]}}}},{$sort:{sales:-1}},{$limit:10}]),
    Order.aggregate([{$match:dateMatch},{$unwind:"$items"},{$lookup:{from:"products",localField:"items.product",foreignField:"_id",as:"product"}},{$unwind:{path:"$product",preserveNullAndEmptyArrays:true}},{$group:{_id:"$product.category",sales:{$sum:"$items.lineTotal"},quantity:{$sum:"$items.quantity"},profit:{$sum:{$subtract:["$items.lineTotal",{$multiply:["$items.purchasePrice","$items.quantity"]}]}}}},{$sort:{sales:-1}},{$limit:10},{$lookup:{from:"categories",localField:"_id",foreignField:"_id",as:"category"}},{$unwind:{path:"$category",preserveNullAndEmptyArrays:true}},{$project:{_id:0,categoryId:"$_id",name:{$ifNull:["$category.name","Uncategorized"]},sales:1,quantity:1,profit:1}}]),
    Customer.aggregate([{$match:{tenantId,createdAt:{$gte:start,$lte:end}}},{$group:{_id:null,newCustomers:{$sum:1}}}]),
    Promise.all([Product.aggregate([{$match:{tenantId}},{$group:{_id:null,products:{$sum:1},variants:{$sum:1},units:{$sum:"$stockQuantity"},costValue:{$sum:{$multiply:["$stockQuantity",{$ifNull:["$purchasePrice",0]}]}},retailValue:{$sum:{$multiply:["$stockQuantity",{$ifNull:["$sellingPrice",0]}]}}} }]),ProductVariant.aggregate([{$match:{tenantId}},{$group:{_id:null,variants:{$sum:1},units:{$sum:"$stockQuantity"},costValue:{$sum:{$multiply:["$stockQuantity",{$ifNull:["$purchasePrice",0]}]}},retailValue:{$sum:{$multiply:["$stockQuantity",{$ifNull:["$sellingPrice",0]}]}}} }])]),
    Product.aggregate([{$match:{tenantId,isAvailable:true}},{$project:{name:1,sku:1,stockQuantity:1,variantEnabled:1}},{$sort:{stockQuantity:1}},{$limit:10}]),
    Customer.aggregate([{$match:{tenantId}},{$group:{_id:null,totalCustomers:{$sum:1},totalSpent:{$sum:"$totalSpent"},avgSpent:{$avg:"$totalSpent"},repeatCustomers:{$sum:{$cond:[{$gt:["$totalOrders",1]},1,0]}}}}]),
    Customer.aggregate([{$match:{tenantId,totalOrders:{$gt:1}}},{$group:{_id:null,count:{$sum:1}}}]),
    Order.aggregate([{$match:dateMatch},{$unwind:"$items"},{$match:{"items.size":{$nin:[null,""]}}},{$group:{_id:"$items.size",quantity:{$sum:"$items.quantity"},sales:{$sum:"$items.lineTotal"}}},{$sort:{quantity:-1,sales:-1}},{$limit:10}]),
    Order.aggregate([{$match:dateMatch},{$unwind:"$items"},{$match:{"items.color":{$nin:[null,""]}}},{$group:{_id:"$items.color",quantity:{$sum:"$items.quantity"},sales:{$sum:"$items.lineTotal"}}},{$sort:{quantity:-1,sales:-1}},{$limit:10}]),
  ]);

  // Dead stock is calculated from the selected-period sold product IDs, while keeping the query tenant scoped.
  const soldIds=new Set(topProducts.map(x=>String(x._id.product)));
  const deadProducts=await Product.find({tenantId,isAvailable:true,stockQuantity:{$gt:0},createdAt:{$lte:new Date(start.getTime()-60*86400000)},_id:{$nin:[...soldIds]}}).select("name sku stockQuantity purchasePrice sellingPrice createdAt").sort({stockQuantity:-1}).limit(10).lean();
  const s=sales[0]||{}, ps=previousSales[0]||{}, r=returns[0]||{}, p=purchases[0]||{};
  const netRevenue=round((s.grossSales||0)-(r.amount||0));
  const expenseTotal=round(expenses[0]?.amount);
  const netProfit=round((s.profit||0)-(r.profitImpact||0)-expenseTotal);
  const inv=(inventory||[]).reduce((a,x)=>({products:a.products+(x.products||0),variants:a.variants+(x.variants||0),units:a.units+(x.units||0),costValue:a.costValue+(x.costValue||0),retailValue:a.retailValue+(x.retailValue||0)}),{products:0,variants:0,units:0,costValue:0,retailValue:0});
  const totalOrders=s.orders||0;
  const previousRevenue=ps.grossSales||0;
  const pct=(cur,prev)=>prev===0?(cur===0?0:100):round(((cur-prev)/Math.abs(prev))*100);
  const allCustomers=customerStats[0]?.totalCustomers||0;
  const repeatCustomers=repeatStats[0]?.count||0;
  res.json({
    range:{start,end,previousStart,previousEnd},
    summary:{expenses:expenseTotal,expenseCount:expenses[0]?.count||0,orders:totalOrders,grossSales:round(s.grossSales),discounts:round(s.discounts),salesCost:round(s.cost),grossProfit:round(s.profit),returns:r.returns||0,returnedAmount:round(r.amount),returnCost:round(r.cost),returnProfitImpact:round(r.profitImpact),netRevenue,netProfit,purchases:p.purchases||0,purchaseAmount:round(p.amount),newCustomers:customers[0]?.newCustomers||0,averageOrderValue:round(totalOrders?netRevenue/totalOrders:0),repeatCustomerRate:round(allCustomers?(repeatCustomers/allCustomers)*100:0)},
    comparison:{previousRevenue:round(previousRevenue),previousOrders:ps.orders||0,previousProfit:round(ps.profit),revenueChangePct:pct(s.grossSales||0,previousRevenue),ordersChangePct:pct(totalOrders,ps.orders||0),profitChangePct:pct(s.profit||0,ps.profit||0)},
    customerMetrics:{totalCustomers:allCustomers,repeatCustomers,repeatCustomerRate:round(allCustomers?(repeatCustomers/allCustomers)*100:0),averageLifetimeSpend:round(customerStats[0]?.avgSpent)},
    expenseDays:expenseDays.map(x=>({date:x._id,amount:round(x.amount)})),
    daily:days.map(x=>({date:x._id,orders:x.orders,sales:round(x.sales),profit:round(x.profit)})),
    payments:payments.map(x=>({method:x._id||"Other",orders:x.orders,amount:round(x.amount)})),
    topProducts:topProducts.map(x=>({productId:x._id.product,name:x._id.name,sku:x._id.sku,quantity:x.quantity,sales:round(x.sales),cost:round(x.cost),profit:round(x.profit)})),
    topCategories:topCategories.map(x=>({...x,sales:round(x.sales),profit:round(x.profit)})),
    topSizes:sizes.map(x=>({size:x._id,quantity:x.quantity,sales:round(x.sales)})),
    topColors:colors.map(x=>({color:x._id,quantity:x.quantity,sales:round(x.sales)})),
    inventory:{...inv,costValue:round(inv.costValue),retailValue:round(inv.retailValue),potentialProfit:round(inv.retailValue-inv.costValue)},
    lowStock,
    deadStock:deadProducts.map(x=>({...x,stockValue:round((x.stockQuantity||0)*(x.purchasePrice||0)),retailValue:round((x.stockQuantity||0)*(x.sellingPrice||0))}))
  });
}
