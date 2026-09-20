import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  referrerCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
  referredCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
  code: { type: String, required: true, uppercase: true, trim: true, index: true },
  status: { type: String, enum: ["pending", "qualified", "rewarded", "cancelled"], default: "pending", index: true },
  qualifyingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  referrerRewardPoints: { type: Number, default: 0, min: 0 },
  referredRewardPoints: { type: Number, default: 0, min: 0 },
  rewardedAt: { type: Date, default: null },
  notes: { type: String, default: "", maxlength: 500 }
}, { timestamps: true });

schema.index({ tenantId: 1, referredCustomerId: 1 }, { unique: true });
schema.index({ tenantId: 1, code: 1, status: 1 });

export default mongoose.model("Referral", schema);
