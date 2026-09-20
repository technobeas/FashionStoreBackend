import SizeChart from "../models/SizeChart.js";
import FashionSize from "../models/FashionSize.js";
import Product from "../models/Product.js";
import { z } from "zod";

const measurement = z.object({
  label:z.string().trim().min(1).max(80),
  unit:z.string().trim().max(10).default("in"),
  values:z.record(z.string(),z.string().trim().max(80)).default({})
});
const input = z.object({
  name:z.string().trim().min(1).max(120),
  description:z.string().trim().max(1000).optional().default(""),
  sizes:z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  measurements:z.array(measurement).max(50).default([]),
  isActive:z.boolean().default(true),
  sortOrder:z.number().int().min(0).max(100000).default(0)
});
function clean(x){return {...x, sizes:Array.isArray(x.sizes)?x.sizes:[], measurements:(x.measurements||[]).map(m=>({...m,values:m.values instanceof Map?Object.fromEntries(m.values):m.values||{}}))};}
async function validateSizes(tenantId,sizes){
  const normalized=[...new Set(sizes.map(x=>x.trim().toUpperCase()).filter(Boolean))];
  if(!normalized.length) return normalized;
  const found=await FashionSize.find({tenantId,key:{$in:normalized}}).select("key").lean();
  const allowed=new Set(found.map(x=>x.key));
  const invalid=normalized.filter(x=>!allowed.has(x));
  if(invalid.length) { const e=new Error(`Invalid sizes: ${invalid.join(", ")}`); e.status=400; throw e; }
  return normalized;
}
export async function list(req,res){
  const activeOnly=req.query.active!=="false";
  const items=await SizeChart.find({tenantId:req.tenant._id,...(activeOnly?{isActive:true}:{})}).sort({sortOrder:1,name:1}).lean();
  res.json({items:items.map(clean)});
}
export async function get(req,res){
  const item=await SizeChart.findOne({_id:req.params.id,tenantId:req.tenant._id}).lean();
  if(!item) return res.status(404).json({message:"Size chart not found"});
  res.json({item:clean(item)});
}
export async function create(req,res){
  const v=input.parse(req.body); v.sizes=await validateSizes(req.tenant._id,v.sizes);
  if(await SizeChart.exists({tenantId:req.tenant._id,name:v.name})) return res.status(409).json({message:"Size chart name already exists."});
  const item=await SizeChart.create({...v,tenantId:req.tenant._id});
  res.status(201).json({item:clean(item.toObject())});
}
export async function update(req,res){
  const v=input.partial().parse(req.body);
  if(v.sizes) v.sizes=await validateSizes(req.tenant._id,v.sizes);
  if(v.name && await SizeChart.exists({tenantId:req.tenant._id,name:v.name,_id:{$ne:req.params.id}})) return res.status(409).json({message:"Size chart name already exists."});
  const item=await SizeChart.findOneAndUpdate({_id:req.params.id,tenantId:req.tenant._id},v,{new:true,runValidators:true}).lean();
  if(!item) return res.status(404).json({message:"Size chart not found"});
  res.json({item:clean(item)});
}
export async function remove(req,res){
  const item=await SizeChart.findOne({_id:req.params.id,tenantId:req.tenant._id});
  if(!item) return res.status(404).json({message:"Size chart not found"});
  await Product.updateMany({tenantId:req.tenant._id,sizeChartId:item._id},{$unset:{sizeChartId:1}});
  await item.deleteOne();
  res.json({message:"Size chart deleted"});
}
