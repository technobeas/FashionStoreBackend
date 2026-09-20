import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
  planCode: { type: String, required: true, lowercase: true, trim: true },
  billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
  startedAt: { type: Date, default: null },
  status: { type: String, enum: ["trialing", "active", "past_due", "grace_period", "cancelled", "expired", "suspended"], default: "trialing", index: true },
  provider: { type: String, default: "manual", lowercase: true, trim: true },
  providerCustomerId: { type: String, default: null },
  providerSubscriptionId: { type: String, default: null },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null },
  graceEndsAt: { type: Date, default: null },
  pendingPlanCode: { type: String, default: null },
  pendingBillingCycle: { type: String, enum: ["monthly", "yearly", null], default: null },
  failedPaymentCount: { type: Number, default: 0, min: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

schema.index({ tenantId: 1, status: 1 });
schema.index({ currentPeriodEnd: 1, status: 1 });

export default mongoose.model("Subscription", schema);
