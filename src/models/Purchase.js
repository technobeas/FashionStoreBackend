import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null },
  name: { type: String, required: true },
  sku: { type: String, required: true, uppercase: true },
  size: { type: String, default: "" },
  color: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  purchaseNumber: { type: String, required: true, trim: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
  supplierName: { type: String, trim: true, default: "" },
  purchaseDate: { type: Date, default: Date.now, index: true },
  items: { type: [itemSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other"], default: "Cash" },
  paymentStatus: { type: String, enum: ["paid", "partial", "due"], default: "paid" },
  notes: { type: String, trim: true, default: "" }
}, { timestamps: true });

schema.index({ tenantId: 1, purchaseNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, purchaseDate: -1 });
export default mongoose.model("Purchase", schema);
