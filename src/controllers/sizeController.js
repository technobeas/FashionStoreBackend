import FashionSize from "../models/FashionSize.js";
import { z } from "zod";

const input = z.object({
  name: z.string().trim().min(1).max(60),
  key: z.string().trim().min(1).max(40),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isActive: z.coerce.boolean().default(true)
});

function clean(v) { return { _id:v._id, name:v.name, key:v.key, sortOrder:v.sortOrder, isActive:v.isActive, createdAt:v.createdAt, updatedAt:v.updatedAt }; }

const DEFAULT_SIZES = [
  ["Extra Small","XS"],["Small","S"],["Medium","M"],["Large","L"],["Extra Large","XL"],
  ["2X Large","XXL"],["3X Large","3XL"],["4X Large","4XL"],["Free Size","FREE SIZE"]
];

export async function list(req,res) {
  const existingCount = await FashionSize.countDocuments({ tenantId:req.tenant._id });
  if (!existingCount) {
    await FashionSize.bulkWrite(DEFAULT_SIZES.map(([name,key],i) => ({
      updateOne: { filter:{tenantId:req.tenant._id,key}, update:{$setOnInsert:{tenantId:req.tenant._id,name,key,sortOrder:i,isActive:true}}, upsert:true }
    })));
  }
  const activeOnly = req.query.active !== "false";
  const items = await FashionSize.find({ tenantId:req.tenant._id, ...(activeOnly ? {isActive:true}: {}) }).sort({sortOrder:1,name:1}).lean();
  res.json({items:items.map(clean)});
}
export async function create(req,res) {
  const v=input.parse(req.body);
  const key=v.key.trim().toUpperCase();
  if (await FashionSize.exists({tenantId:req.tenant._id,key})) return res.status(409).json({message:"Size key already exists."});
  const item=await FashionSize.create({...v,key,tenantId:req.tenant._id});
  res.status(201).json({item:clean(item)});
}
export async function update(req,res) {
  const v=input.partial().parse(req.body);
  if(v.key) v.key=v.key.trim().toUpperCase();
  if(v.key && await FashionSize.exists({tenantId:req.tenant._id,key:v.key,_id:{$ne:req.params.id}})) return res.status(409).json({message:"Size key already exists."});
  const item=await FashionSize.findOneAndUpdate({_id:req.params.id,tenantId:req.tenant._id},v,{new:true,runValidators:true}).lean();
  if(!item) return res.status(404).json({message:"Size not found"});
  res.json({item:clean(item)});
}
export async function remove(req,res) {
  const item=await FashionSize.findOneAndDelete({_id:req.params.id,tenantId:req.tenant._id});
  if(!item) return res.status(404).json({message:"Size not found"});
  res.json({message:"Size deleted"});
}
