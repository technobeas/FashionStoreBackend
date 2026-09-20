import mongoose from "mongoose";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Purchase from "../models/Purchase.js";
import Supplier from "../models/Supplier.js";
import InventoryTransaction from "../models/InventoryTransaction.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";

const money=n=>Math.round(Number(n)*100)/100;
async function nextNumber(tenantId){ const d=new Date(); const base=`PUR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; const count=await Purchase.countDocuments({tenantId,purchaseNumber:{$regex:`^${base}-`}}); return `${base}-${String(count+1).padStart(4,"0")}`; }

export async function create(req,res){
 const b=req.body||{}, raw=Array.isArray(b.items)?b.items:[];
 if(!raw.length)return res.status(400).json({message:"Add at least one purchase item."});
 let supplier=null;
 if(b.supplierId){if(!mongoose.isValidObjectId(b.supplierId))return res.status(400).json({message:"Invalid supplier."}); supplier=await Supplier.findOne({_id:b.supplierId,tenantId:req.tenant._id}).lean(); if(!supplier)return res.status(404).json({message:"Supplier not found."});}
 const normalized=raw.map(x=>({productId:String(x.product||""),variantId:x.variant?String(x.variant):"",quantity:Math.floor(Number(x.quantity)),unitCost:money(x.unitCost)}));
 if(normalized.some(x=>!mongoose.isValidObjectId(x.productId)||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unitCost)||x.unitCost<0))return res.status(400).json({message:"Every purchase item needs a valid product, quantity and unit cost."});
 const products=await Product.find({tenantId:req.tenant._id,_id:{$in:normalized.map(x=>x.productId)}}).select("+purchasePrice +sellingPrice +discountedPrice").lean();
 const pm=new Map(products.map(x=>[String(x._id),x]));
 const vids=normalized.filter(x=>x.variantId).map(x=>x.variantId);
 const vars=vids.length?await ProductVariant.find({tenantId:req.tenant._id,_id:{$in:vids}}).select("+purchasePrice +sellingPrice +discountedPrice").lean():[];
 const vm=new Map(vars.map(x=>[String(x._id),x]));
 let subtotal=0; const items=[];
 for(const x of normalized){const p=pm.get(x.productId);if(!p)return res.status(404).json({message:"Product not found."});let v=null;if(p.variantEnabled){v=vm.get(x.variantId);if(!v||String(v.productId)!==String(p._id))return res.status(400).json({message:`Invalid variant for ${p.name}.`});}
 const qty=x.quantity; subtotal=money(subtotal+x.unitCost*qty);items.push({product:p._id,variant:v?._id||null,name:p.name,sku:v?.sku||p.sku,size:v?.size||"",color:v?.color||"",quantity:qty,unitCost:x.unitCost,lineTotal:money(x.unitCost*qty)});}
 const discount=Math.max(0,Number(b.discount)||0),tax=Math.max(0,Number(b.tax)||0),total=money(Math.max(0,subtotal-discount+tax));
 const updated=[]; try{
  for(const x of normalized){const p=pm.get(x.productId); if(p.variantEnabled){const v=vm.get(x.variantId);const u=await ProductVariant.findOneAndUpdate({tenantId:req.tenant._id,_id:v._id,productId:p._id},{$inc:{stockQuantity:x.quantity},$set:{purchasePrice:x.unitCost,isAvailable:true}},{new:true});if(!u)throw Object.assign(new Error("Variant stock update failed."),{statusCode:409});await Product.updateOne({tenantId:req.tenant._id,_id:p._id},{$inc:{stockQuantity:x.quantity},$set:{isAvailable:true,purchasePrice:x.unitCost}});updated.push(x);}else{const u=await Product.findOneAndUpdate({tenantId:req.tenant._id,_id:p._id},{$inc:{stockQuantity:x.quantity},$set:{isAvailable:true,purchasePrice:x.unitCost}},{new:true});if(!u)throw Object.assign(new Error("Product stock update failed."),{statusCode:409});updated.push(x);}}
  purchase=await Purchase.create({tenantId:req.tenant._id,purchaseNumber:await nextNumber(req.tenant._id),supplier:supplier?._id||null,supplierName:supplier?.name||String(b.supplierName||"").trim(),purchaseDate:b.purchaseDate||new Date(),items,subtotal,discount,tax,totalAmount:total,paymentMethod:b.paymentMethod||"Cash",paymentStatus:b.paymentStatus||"paid",notes:String(b.notes||"").trim()});
  for (const x of normalized) {
   const p=pm.get(x.productId);
   if (p.variantEnabled) {
    const v=vm.get(x.variantId);
    const after=Number(v.stockQuantity)+x.quantity;
    const before=after-x.quantity;
    const tx=await recordInventoryTransaction({tenantId:req.tenant._id,product:p._id,variant:v._id,productName:p.name,sku:v.sku,type:"PURCHASE",quantityBefore:before,quantityChange:x.quantity,quantityAfter:after,referenceType:"Purchase",referenceId:purchase._id,note:`Purchase ${purchase.purchaseNumber}`,createdBy:req.admin?._id||null});
    ledgerIds.push(tx._id);
   } else {
    const after=Number(p.stockQuantity)+x.quantity;
    const before=after-x.quantity;
    const tx=await recordInventoryTransaction({tenantId:req.tenant._id,product:p._id,variant:null,productName:p.name,sku:p.sku,type:"PURCHASE",quantityBefore:before,quantityChange:x.quantity,quantityAfter:after,referenceType:"Purchase",referenceId:purchase._id,note:`Purchase ${purchase.purchaseNumber}`,createdBy:req.admin?._id||null});
    ledgerIds.push(tx._id);
   }
  }
  res.status(201).json(purchase);
 }catch(e){
  if (ledgerIds.length) await InventoryTransaction.deleteMany({_id:{$in:ledgerIds},tenantId:req.tenant._id}).catch(()=>{});
  if (purchase?._id) await Purchase.deleteOne({_id:purchase._id,tenantId:req.tenant._id}).catch(()=>{});
  for(const x of updated){await Product.updateOne({tenantId:req.tenant._id,_id:x.productId},{$inc:{stockQuantity:-x.quantity}}).catch(()=>{});if(x.variantId)await ProductVariant.updateOne({tenantId:req.tenant._id,_id:x.variantId},{$inc:{stockQuantity:-x.quantity}}).catch(()=>{});} if(e.statusCode)return res.status(e.statusCode).json({message:e.message});throw e;}
}
export async function list(req,res){const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));const filter={tenantId:req.tenant._id};if(req.query.supplierId)filter.supplier=req.query.supplierId;const [items,total,summary]=await Promise.all([Purchase.find(filter).sort("-purchaseDate").skip((page-1)*limit).limit(limit).populate("supplier","name phone").lean(),Purchase.countDocuments(filter),Purchase.aggregate([{$match:filter},{$group:{_id:null,total:{$sum:"$totalAmount"},count:{$sum:1}}}])]);res.json({items,total,page,limit,summary:summary[0]||{total:0,count:0}});}
export async function get(req,res){if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid purchase."});const x=await Purchase.findOne({_id:req.params.id,tenantId:req.tenant._id}).populate("supplier","name phone email").lean();if(!x)return res.status(404).json({message:"Purchase not found."});res.json(x);}
