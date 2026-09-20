import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null, index: true },
  productName: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  type: {
    type: String,
    enum: ["PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "DAMAGED", "LOST", "TRANSFER"],
    required: true,
    index: true
  },
  quantityBefore: { type: Number, required: true, min: 0 },
  quantityChange: { type: Number, required: true },
  quantityAfter: { type: Number, required: true, min: 0 },
  referenceType: {
    type: String,
    enum: ["Purchase", "Order", "Return", "StockAdjustment", "Manual", "Transfer"],
    default: "Manual"
  },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  note: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true }
}, { timestamps: true });

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, product: 1, createdAt: -1 });
schema.index({ tenantId: 1, variant: 1, createdAt: -1 });
schema.index({ tenantId: 1, type: 1, createdAt: -1 });
schema.index({ tenantId: 1, referenceType: 1, referenceId: 1 });

export default mongoose.model("InventoryTransaction", schema);
