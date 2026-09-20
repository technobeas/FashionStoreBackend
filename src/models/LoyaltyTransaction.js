import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
  type: { type: String, enum: ["EARN", "REDEEM", "ADJUST", "EXPIRE", "REFERRAL", "BONUS", "REVERSAL"], required: true },
  points: { type: Number, required: true },
  balanceAfter: { type: Number, min: 0, required: true },
  source: { type: String, enum: ["ORDER", "MANUAL", "REFERRAL", "CAMPAIGN", "EXPIRY", "RETURN_REVERSAL", "OTHER"], default: "OTHER" },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  expiresAt: { type: Date, default: null, index: true },
  note: { type: String, trim: true, maxlength: 500, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null }
}, { timestamps: true });

schema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
schema.index({ tenantId: 1, orderId: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: "objectId" }, type: "EARN" } });

export default mongoose.model("LoyaltyTransaction", schema);
