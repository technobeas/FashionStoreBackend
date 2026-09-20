import mongoose from "mongoose";

const measurementSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 80 },
  unit: { type: String, trim: true, default: "in" },
  values: { type: Map, of: String, default: {} }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, default: "", maxlength: 1000 },
  sizes: [{ type: String, trim: true, uppercase: true }],
  measurements: { type: [measurementSchema], default: [] },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0, index: true }
}, { timestamps: true });

schema.index({ tenantId: 1, name: 1 }, { unique: true });
schema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });

export default mongoose.model("SizeChart", schema);
