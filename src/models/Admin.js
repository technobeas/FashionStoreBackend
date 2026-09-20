import mongoose from "mongoose";

const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "owner", "manager", "sales", "inventory", "staff", "super_admin"], default: "owner" },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("Admin", schema);
