import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
  provider: { type: String, default: "manual", lowercase: true },
  providerPaymentId: { type: String, default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "INR", uppercase: true },
  status: { type: String, enum: ["pending", "authorized", "paid", "failed", "refunded"], default: "pending", index: true },
  method: { type: String, default: "manual" },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ provider: 1, providerPaymentId: 1 });

export default mongoose.model("Payment", schema);
