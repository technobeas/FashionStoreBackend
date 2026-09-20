import mongoose from "mongoose";

const schema = new mongoose.Schema({
  provider: { type: String, required: true, lowercase: true },
  eventId: { type: String, required: true, trim: true },
  eventType: { type: String, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
  processedAt: { type: Date, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: "" }
}, { timestamps: true });

schema.index({ provider: 1, eventId: 1 }, { unique: true });

export default mongoose.model("BillingEvent", schema);
