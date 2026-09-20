import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  period: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
  products: { type: Number, default: 0, min: 0 },
  variants: { type: Number, default: 0, min: 0 },
  staff: { type: Number, default: 0, min: 0 },
  customers: { type: Number, default: 0, min: 0 },
  orders: { type: Number, default: 0, min: 0 },
  storageBytes: { type: Number, default: 0, min: 0 },
  measuredAt: { type: Date, default: Date.now }
}, { timestamps: true });

schema.index({ tenantId: 1, period: 1 }, { unique: true });
schema.index({ tenantId: 1, measuredAt: -1 });

export default mongoose.model("Usage", schema);
