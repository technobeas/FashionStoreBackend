import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";
import { ROLE_PERMISSIONS } from "../middleware/permissions.js";

const ROLES = ["manager","sales","inventory","staff"];

function safe(doc) {
  return { id: doc._id, username: doc.username, role: doc.role, permissions: doc.permissions || [], active: doc.active, lastLoginAt: doc.lastLoginAt, createdAt: doc.createdAt };
}
export async function list(req,res) {
  const rows = await Admin.find({ tenantId: req.tenant._id }).select("username role permissions active lastLoginAt createdAt").sort({createdAt:-1}).lean();
  res.json({ staff: rows.map(safe) });
}
export async function get(req,res) {
  const row = await Admin.findOne({_id:req.params.id,tenantId:req.tenant._id}).select("username role permissions active lastLoginAt createdAt").lean();
  if(!row) return res.status(404).json({message:"Staff member not found."});
  res.json({staff:safe(row)});
}
export async function create(req,res) {
  const {username,password,role,permissions} = req.body;
  const normalized=String(username||"").trim().toLowerCase();
  if(!/^[a-z0-9._-]{3,40}$/.test(normalized)) return res.status(400).json({message:"Username must be 3-40 characters."});
  if(String(password||"").length<8) return res.status(400).json({message:"Password must be at least 8 characters."});
  if(!ROLES.includes(role)) return res.status(400).json({message:"Invalid staff role."});
  if(await Admin.findOne({username:normalized})) return res.status(409).json({message:"Username is already in use."});
  const allowed=Array.isArray(permissions)&&permissions.length?permissions:(ROLE_PERMISSIONS[role]||[]);
  const admin=await Admin.create({username:normalized,passwordHash:await bcrypt.hash(password,12),role,permissions:allowed,tenantId:req.tenant._id,active:true});
  res.status(201).json({staff:safe(admin)});
}
export async function update(req,res) {
  const admin=await Admin.findOne({_id:req.params.id,tenantId:req.tenant._id});
  if(!admin) return res.status(404).json({message:"Staff member not found."});
  if(admin._id.toString()===req.admin._id.toString() && req.body.active===false) return res.status(400).json({message:"You cannot deactivate your own account."});
  if(admin.role==="owner") return res.status(403).json({message:"Owner account cannot be modified here."});
  if(req.body.role && !ROLES.includes(req.body.role)) return res.status(400).json({message:"Invalid staff role."});
  if(req.body.username){
    const username=String(req.body.username).trim().toLowerCase();
    const clash=await Admin.findOne({username,_id:{$ne:admin._id}});
    if(clash) return res.status(409).json({message:"Username is already in use."});
    admin.username=username;
  }
  if(req.body.role){ admin.role=req.body.role; if(!req.body.permissions) admin.permissions=ROLE_PERMISSIONS[req.body.role]||[]; }
  if(Array.isArray(req.body.permissions)) admin.permissions=req.body.permissions;
  if(typeof req.body.active==="boolean") admin.active=req.body.active;
  if(req.body.password){ if(String(req.body.password).length<8)return res.status(400).json({message:"Password must be at least 8 characters."}); admin.passwordHash=await bcrypt.hash(req.body.password,12); }
  await admin.save(); res.json({staff:safe(admin)});
}
export async function remove(req,res) {
  const admin=await Admin.findOne({_id:req.params.id,tenantId:req.tenant._id});
  if(!admin) return res.status(404).json({message:"Staff member not found."});
  if(admin.role==="owner" || admin._id.toString()===req.admin._id.toString()) return res.status(400).json({message:"This account cannot be deleted."});
  admin.active=false; await admin.save(); res.json({message:"Staff member deactivated."});
}
export function roles(req,res){ res.json({roles:ROLES,rolePermissions:ROLE_PERMISSIONS}); }
