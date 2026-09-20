import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import crypto from "node:crypto";
import { bookingNumber } from "../services/bookingService.js";
import { recordInventoryTransaction } from "../services/inventoryService.js";

const clean = (v, max=300) => String(v ?? "").trim().slice(0,max);
const money = v => Math.round(Number(v || 0) * 100) / 100;

function publicBooking(b) {
  return { id:b._id, bookingNumber:b.bookingNumber, product:b.product, variant:b.variant, productName:b.productName, sku:b.sku, color:b.color, size:b.size, quantity:b.quantity, unitPrice:b.unitPrice, customerName:b.customerName, customerPhone:b.customerPhone, status:b.status, expiresAt:b.expiresAt, createdAt:b.createdAt, orderId:b.orderId };
}

export async function create(req,res,next){
  try {
    const body=req.body||{};
    const productId=clean(body.productId,80), variantId=clean(body.variantId,80);
    const qty=Math.max(1,Math.floor(Number(body.quantity)||1));
    const name=clean(body.customerName,120), phone=clean(body.customerPhone,30), email=clean(body.email,160).toLowerCase();
    const accepted=body.acceptedTerms===true || body.acceptedTerms==="true";
    if(!mongoose.isValidObjectId(productId)) return res.status(400).json({message:"Invalid product."});
    if(!name || phone.length<5) return res.status(400).json({message:"Name and contact number are required."});
    if(!accepted) return res.status(400).json({message:"Accept the terms, privacy policy and booking contact policy before booking."});
    const p=await Product.findOne({tenantId:req.tenant._id,_id:productId,isAvailable:true}).select("name sku variantEnabled sellingPrice discountedPrice stockQuantity reservedQuantity").lean();
    if(!p) return res.status(404).json({message:"Product is no longer available."});
    let v=null, unitPrice=Number(p.discountedPrice ?? p.sellingPrice ?? 0), sku=p.sku, color="", size="";
    if(p.variantEnabled){
      if(!mongoose.isValidObjectId(variantId)) return res.status(400).json({message:"Select a valid variant."});
      v=await ProductVariant.findOneAndUpdate({tenantId:req.tenant._id,_id:variantId,productId,isAvailable:true,$expr:{$gte:[{$subtract:["$stockQuantity","$reservedQuantity"]},qty]}},{ $inc:{reservedQuantity:qty}},{new:true}).select("sku color size sellingPrice discountedPrice stockQuantity reservedQuantity").lean();
      if(!v) return res.status(409).json({message:"That variant is no longer available. Please refresh and try again."});
      await Product.updateOne({tenantId:req.tenant._id,_id:productId},{$inc:{reservedQuantity:qty}});
      unitPrice=Number(v.discountedPrice ?? v.sellingPrice ?? 0); sku=v.sku; color=v.color||""; size=v.size||"";
    } else {
      const updated=await Product.findOneAndUpdate({tenantId:req.tenant._id,_id:productId,isAvailable:true,$expr:{$gte:[{$subtract:["$stockQuantity","$reservedQuantity"]},qty]}},{$inc:{reservedQuantity:qty}},{new:true}).select("stockQuantity reservedQuantity").lean();
      if(!updated) return res.status(409).json({message:"This item is already booked or out of stock. Please refresh and try again."});
    }
    const acceptedAt=new Date();
    const customer=await Customer.findOneAndUpdate({tenantId:req.tenant._id,phone},{ $set:{name,email},$setOnInsert:{tenantId:req.tenant._id,phone}},{new:true,upsert:true});
    const expiresAt=new Date(Date.now()+24*60*60*1000);
    try {
      const b=await Booking.create({tenantId:req.tenant._id,bookingNumber:bookingNumber(),product:productId,variant:v?variantId:null,productName:p.name,sku,color,size,quantity:qty,unitPrice:money(unitPrice),customerName:name,customerPhone:phone,contact:{email,whatsapp:clean(body.whatsapp||phone,30)},expiresAt,consent:{accepted:true,acceptedAt,termsVersion:"v1",privacyVersion:"v1",contactPolicyVersion:"booking-contact-v1",ip:clean(req.ip,100),userAgent:clean(req.get("user-agent"),500)}});
      return res.status(201).json({booking:publicBooking(b),message:`Booked successfully. Please visit the store within 24 hours. Booking ID: ${b.bookingNumber}`});
    } catch(e){
      if(v){ await ProductVariant.updateOne({tenantId:req.tenant._id,_id:variantId},{$inc:{reservedQuantity:-qty}}); await Product.updateOne({tenantId:req.tenant._id,_id:productId},{$inc:{reservedQuantity:-qty}}); }
      else await Product.updateOne({tenantId:req.tenant._id,_id:productId},{$inc:{reservedQuantity:-qty}});
      throw e;
    }
  }catch(e){next(e)}
}

export async function listAdmin(req,res,next){
  try{
    const page=Math.max(Number(req.query.page)||1,1), limit=Math.min(Math.max(Number(req.query.limit)||20,1),100);
    const filter={tenantId:req.tenant._id};
    if(req.query.status) filter.status=req.query.status;
    if(req.query.q){const q=clean(req.query.q,100).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); filter.$or=[{bookingNumber:new RegExp(q,"i")},{customerName:new RegExp(q,"i")},{customerPhone:new RegExp(q,"i")},{productName:new RegExp(q,"i")}];}
    const [items,total]=await Promise.all([Booking.find(filter).sort("-createdAt").skip((page-1)*limit).limit(limit).lean(),Booking.countDocuments(filter)]);
    res.json({items:items.map(publicBooking),pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
  }catch(e){next(e)}
}

export async function convertToOnlineOrder(req,res,next){
  try{
    const b=await Booking.findOne({tenantId:req.tenant._id,_id:req.params.id,status:"active"});
    if(!b) return res.status(404).json({message:"Active booking not found."});
    if(new Date(b.expiresAt)<=new Date()) return res.status(409).json({message:"Booking has expired."});
    let customer=await Customer.findOne({tenantId:req.tenant._id,phone:b.customerPhone});
    if(!customer) customer=await Customer.create({tenantId:req.tenant._id,name:b.customerName,phone:b.customerPhone,email:b.contact?.email||""});
    const total=money(Number(b.unitPrice)*Number(b.quantity));
    const order=await Order.create({tenantId:req.tenant._id,customerId:customer._id,orderNumber:`NC-ONL-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,customerName:b.customerName,customerPhone:b.customerPhone,items:[{product:b.product,variant:b.variant,name:b.productName,sku:b.sku,color:b.color,size:b.size,quantity:b.quantity,unitPrice:b.unitPrice,sellingPrice:b.unitPrice,discountedPrice:b.unitPrice,purchasePrice:0,lineTotal:total,productDiscountAmount:0}],subtotal:total,discountAmount:0,discountedSubtotal:total,finalTotal:total,totalCost:0,profit:total,paymentMethod:"Credit",payments:[],paymentStatus:"pending",paidAmount:0,dueAmount:total,status:"paid",source:"ONLINE",fulfillmentStatus:"pending",publicTrackingToken:crypto.randomBytes(24).toString("hex"),contact:{email:b.contact?.email||"",whatsapp:b.contact?.whatsapp||b.customerPhone},notes:`Converted from booking ${b.bookingNumber}`,returnPolicy:{eligible:false,snapshot:"Online orders are not eligible for returns. Please visit the store for assistance."}});
    b.status="converted"; b.orderId=order._id; await b.save();
    if(b.variant){
      const v=await ProductVariant.findOneAndUpdate({tenantId:req.tenant._id,_id:b.variant},{$inc:{reservedQuantity:-b.quantity,stockQuantity:-b.quantity}},{new:true});
      const prod=await Product.findOneAndUpdate({tenantId:req.tenant._id,_id:b.product},{$inc:{reservedQuantity:-b.quantity,stockQuantity:-b.quantity}},{new:true});
      if(v) await recordInventoryTransaction({tenantId:req.tenant._id,product:b.product,variant:b.variant,productName:b.productName,sku:b.sku,type:"SALE",quantityBefore:Number(v.stockQuantity||0)+b.quantity,quantityChange:-b.quantity,quantityAfter:Number(v.stockQuantity||0),referenceType:"Order",referenceId:order._id,note:`Booking ${b.bookingNumber} converted to ${order.orderNumber}`,createdBy:req.admin?._id||null});
    } else {
      const prod=await Product.findOneAndUpdate({tenantId:req.tenant._id,_id:b.product},{$inc:{reservedQuantity:-b.quantity,stockQuantity:-b.quantity}},{new:true});
      if(prod) await recordInventoryTransaction({tenantId:req.tenant._id,product:b.product,productName:b.productName,sku:b.sku,type:"SALE",quantityBefore:Number(prod.stockQuantity||0)+b.quantity,quantityChange:-b.quantity,quantityAfter:Number(prod.stockQuantity||0),referenceType:"Order",referenceId:order._id,note:`Booking ${b.bookingNumber} converted to ${order.orderNumber}`,createdBy:req.admin?._id||null});
    }
    res.status(201).json({booking:publicBooking(b),order});
  }catch(e){next(e)}
}
