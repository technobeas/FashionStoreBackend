import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null, index: true },
  productName: { type: String, required: true },
  sku: { type: String, required: true },
  type: { type: String, enum: ["increase", "decrease", "set"], required: true },
  quantityBefore: { type: Number, required: true, min: 0 },
  quantityChange: { type: Number, required: true },
  quantityAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  notes: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null }
}, { timestamps: true });

schema.index({ tenantId: 1, createdAt: -1 });
export default mongoose.model("StockAdjustment", schema);
