import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  whatsapp: { type: String, trim: true, maxlength: 30, default: "" },
  tags: { type: [String], default: [] },
  email: { type: String, trim: true, lowercase: true, default: "" },
  address: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  totalOrders: { type: Number, default: 0, min: 0 },
  totalSpent: { type: Number, default: 0, min: 0 },
  totalReturns: { type: Number, default: 0, min: 0 },
  totalReturnAmount: { type: Number, default: 0, min: 0 },
  lastPurchaseAt: { type: Date, default: null },
  lastOrderAt: { type: Date, default: null },
  firstPurchaseAt: { type: Date, default: null },
  averageOrderValue: { type: Number, default: 0, min: 0 },
  lifetimeValue: { type: Number, default: 0, min: 0 },
  crmSegment: { type: String, default: "new", index: true },
  followUpAt: { type: Date, default: null },
  followUpNote: { type: String, trim: true, default: "", maxlength: 500 },
  birthday: { type: Date, default: null },
  anniversary: { type: Date, default: null },
  loyaltyPointsBalance: { type: Number, default: 0, min: 0 },
  loyaltyLifetimeEarned: { type: Number, default: 0, min: 0 },
  loyaltyLifetimeRedeemed: { type: Number, default: 0, min: 0 },
  loyaltyTier: { type: String, enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM"], default: "BRONZE", index: true },
  referralCode: { type: String, trim: true, uppercase: true, index: true, default: "" },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
  onlineConsent: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: "v1" },
    privacyVersion: { type: String, default: "v1" },
    returnPolicyVersion: { type: String, default: "online-no-return-v1" },
    ip: { type: String, default: "", maxlength: 100 }
  }
}, { timestamps: true });

schema.index({ tenantId: 1, phone: 1 }, { unique: true });
schema.index({ tenantId: 1, name: 1 });
schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, crmSegment: 1, updatedAt: -1 });
schema.index({ tenantId: 1, lastPurchaseAt: -1 });
schema.index({ tenantId: 1, loyaltyTier: 1, loyaltyPointsBalance: -1 });
schema.index({ tenantId: 1, referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: "string", $ne: "" } } });
schema.index({ tenantId: 1, referredBy: 1 });

export default mongoose.model("Customer", schema);
