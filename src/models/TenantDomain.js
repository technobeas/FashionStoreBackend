import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  hostname: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  type: { type: String, enum: ["subdomain", "custom"], required: true },
  status: { type: String, enum: ["pending", "active", "disabled"], default: "pending", index: true },
  isPrimary: { type: Boolean, default: false, index: true },
  verificationToken: { type: String, default: null },
  verifiedAt: { type: Date, default: null },
  redirectToPrimary: { type: Boolean, default: false },
  lastVerifiedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, hostname: 1 }, { unique: true });

export default mongoose.model("TenantDomain", schema);
