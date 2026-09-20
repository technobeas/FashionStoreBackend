import mongoose from "mongoose";

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  monthlyPrice: { type: Number, default: 0, min: 0 },
  yearlyPrice: { type: Number, default: 0, min: 0 },
  limits: {
    products: { type: Number, default: 100 },
    variants: { type: Number, default: 500 },
    staff: { type: Number, default: 2 },
    customers: { type: Number, default: 1000 },
    suppliers: { type: Number, default: 100 },
    storageMb: { type: Number, default: 500 }
  },
  features: { type: [String], default: [] },
  active: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model("SaaSPlan", schema);
