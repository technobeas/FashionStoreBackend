import mongoose from "mongoose";

const audienceSchema = new mongoose.Schema({
  segment: { type: String, enum: ["all", "new", "returning", "loyal", "vip", "at_risk", "inactive"], default: "all" },
  loyaltyTier: { type: String, enum: ["", "BRONZE", "SILVER", "GOLD", "PLATINUM"], default: "" },
  tag: { type: String, trim: true, default: "" },
  minSpend: { type: Number, min: 0, default: 0 },
  maxSpend: { type: Number, min: 0, default: null },
  daysSincePurchaseMin: { type: Number, min: 0, default: null },
  daysSincePurchaseMax: { type: Number, min: 0, default: null }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  url: { type: String, trim: true, default: "/" },
  kind: { type: String, enum: ["promotion", "offer", "new_arrival", "win_back", "birthday", "anniversary", "loyalty", "referral"], default: "promotion" },
  audience: { type: audienceSchema, default: () => ({}) },
  scheduledFor: { type: Date, default: null, index: true },
  status: { type: String, enum: ["draft", "scheduled", "sending", "sent", "partial", "failed", "cancelled"], default: "draft", index: true },
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification", default: null },
  recipientCount: { type: Number, default: 0, min: 0 },
  successCount: { type: Number, default: 0, min: 0 },
  failureCount: { type: Number, default: 0, min: 0 },
  clickedCount: { type: Number, default: 0, min: 0 },
  sentAt: { type: Date, default: null },
  attempts: { type: Number, default: 0, min: 0 },
  lastError: { type: String, default: "", maxlength: 500 }
}, { timestamps: true });

schema.index({ tenantId: 1, status: 1, scheduledFor: 1 });
schema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model("Campaign", schema);
