import mongoose from "mongoose";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import StockAdjustment from "../models/StockAdjustment.js";
import InventoryTransaction from "../models/InventoryTransaction.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";

export async function adjust(req,res){
 const b=req.body||{}, pid=String(b.product||""), vid=b.variant?String(b.variant):"";
 if(!mongoose.isValidObjectId(pid))return res.status(400).json({message:"Invalid product."});
 const p=await Product.findOne({_id:pid,tenantId:req.tenant._id}).lean();if(!p)return res.status(404).json({message:"Product not found."});
 let before,after,sku,name=p.name;
 const type=b.type, value=Number(b.quantityChange);
 if(!["increase","decrease","set"].includes(type)||!Number.isFinite(value))return res.status(400).json({message:"Invalid adjustment."});
 if(!String(b.reason||"").trim())return res.status(400).json({message:"Reason is required."});
 if(p.variantEnabled){if(!mongoose.isValidObjectId(vid))return res.status(400).json({message:"Variant is required."});const v=await ProductVariant.findOne({_id:vid,tenantId:req.tenant._id,productId:pid}).lean();if(!v)return res.status(404).json({message:"Variant not found."});before=Number(v.stockQuantity);after=type==="set"?Math.max(0,Math.floor(value)):Math.max(0,before+(type==="increase"?Math.floor(value):-Math.floor(value)));sku=v.sku;await ProductVariant.updateOne({_id:v._id,tenantId:req.tenant._id},{$set:{stockQuantity:after,isAvailable:after>0}});await Product.updateOne({_id:pid,tenantId:req.tenant._id},{$set:{stockQuantity:Math.max(0,Number(p.stockQuantity)+(after-before)),isAvailable:true}});}
 else{before=Number(p.stockQuantity||0);after=type==="set"?Math.max(0,Math.floor(value)):Math.max(0,before+(type==="increase"?Math.floor(value):-Math.floor(value)));sku=p.sku;await Product.updateOne({_id:pid,tenantId:req.tenant._id},{$set:{stockQuantity:after,isAvailable:after>0}});}
 const x=await StockAdjustment.create({tenantId:req.tenant._id,product:p._id,variant:p.variantEnabled?vid:null,productName:name,sku,type,quantityBefore:before,quantityChange:after-before,quantityAfter:after,reason:String(b.reason).trim(),notes:String(b.notes||"").trim(),createdBy:req.admin?._id||null});
 try {
  await recordInventoryTransaction({
   tenantId:req.tenant._id, product:p._id, variant:p.variantEnabled?vid:null,
   productName:name, sku, type:type==="increase"?"ADJUSTMENT":"ADJUSTMENT",
   quantityBefore:before, quantityChange:after-before, quantityAfter:after,
   referenceType:"StockAdjustment", referenceId:x._id,
   note:String(b.reason).trim() + (b.notes ? ` — ${String(b.notes).trim()}` : ""),
   createdBy:req.admin?._id||null
  });
 } catch (ledgerError) {
  // The legacy adjustment remains the source of compatibility. Revert the
  // stock mutation if the new mandatory ledger entry cannot be persisted.
  if (p.variantEnabled) {
   await ProductVariant.updateOne({_id:vid,tenantId:req.tenant._id,productId:p._id},{$set:{stockQuantity:before,isAvailable:before>0}}).catch(()=>{});
   await Product.updateOne({_id:p._id,tenantId:req.tenant._id},{$inc:{stockQuantity:before-after}}).catch(()=>{});
  } else {
   await Product.updateOne({_id:p._id,tenantId:req.tenant._id},{$set:{stockQuantity:before,isAvailable:before>0}}).catch(()=>{});
  }
  await StockAdjustment.deleteOne({_id:x._id,tenantId:req.tenant._id}).catch(()=>{});
  throw ledgerError;
 }
 res.status(201).json(x);
}
export async function history(req,res){const filter={tenantId:req.tenant._id};if(req.query.product&&mongoose.isValidObjectId(req.query.product))filter.product=req.query.product;const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));res.json(await StockAdjustment.find(filter).sort("-createdAt").limit(limit).populate("createdBy","username").lean());}
export async function lowStock(req,res){const threshold=Math.max(0,Number(req.query.threshold)||5);const [products,variants]=await Promise.all([Product.find({tenantId:req.tenant._id,variantEnabled:false,stockQuantity:{$lte:threshold}}).select("name sku stockQuantity isAvailable category").populate("category","name").lean(),ProductVariant.find({tenantId:req.tenant._id,stockQuantity:{$lte:threshold}}).populate("productId","name sku").select("productId sku size color stockQuantity isAvailable").lean()]);res.json({threshold,products,variants});}

export async function ledger(req,res){
 const page=Math.max(1,Number(req.query.page)||1);
 const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
 const filter={tenantId:req.tenant._id};
 if(req.query.product&&mongoose.isValidObjectId(req.query.product))filter.product=req.query.product;
 if(req.query.variant&&mongoose.isValidObjectId(req.query.variant))filter.variant=req.query.variant;
 if(["PURCHASE","SALE","RETURN","ADJUSTMENT","DAMAGED","LOST","TRANSFER"].includes(req.query.type))filter.type=req.query.type;
 const [items,total]=await Promise.all([
  InventoryTransaction.find(filter).sort("-createdAt").skip((page-1)*limit).limit(limit)
   .populate("createdBy","username name").lean(),
  InventoryTransaction.countDocuments(filter)
 ]);
 res.json({items,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}
