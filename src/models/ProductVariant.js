import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  size: { type: String, trim: true, default: "" },
  color: { type: String, trim: true, default: "" },
  colorCode: { type: String, trim: true, default: "" },
  barcode: { type: String, trim: true, default: "", index: true },
  image: { publicId: String, secureUrl: String, bytes: { type: Number, default: 0, min: 0 } },
  stockQuantity: { type: Number, required: true, min: 0, default: 0 },
  reservedQuantity: { type: Number, min: 0, default: 0 },
  purchasePrice: { type: Number, required: true, min: 0, select: false },
  sellingPrice: { type: Number, required: true, min: 0, select: false },
  discountedPrice: { type: Number, min: 0, select: false, default: null },
  isAvailable: { type: Boolean, default: true }
}, { timestamps: true });

schema.index({ tenantId: 1, sku: 1 }, { unique: true });
schema.index({ tenantId: 1, productId: 1, size: 1, color: 1 }, { unique: true });
schema.index({ tenantId: 1, productId: 1 });
schema.index({ tenantId: 1, size: 1, color: 1, isAvailable: 1, stockQuantity: 1 });
schema.index({ tenantId: 1, barcode: 1 });

export default mongoose.model("ProductVariant", schema);
