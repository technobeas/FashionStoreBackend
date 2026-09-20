import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null },
  orderItemIndex: { type: Number, min: 0, default: null },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  color: { type: String, default: "" },
  size: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  sellingPrice: { type: Number, required: true, min: 0 },
  discountedPrice: { type: Number, required: true, min: 0 },
  refundUnitPrice: { type: Number, required: true, min: 0 },
  purchasePrice: { type: Number, required: true, min: 0 },
  lineReturnAmount: { type: Number, required: true, min: 0 },
  lineCost: { type: Number, required: true, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true },
  returnNumber: { type: String, required: true, index: true },
  items: { type: [itemSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
  calculatedAmount: { type: Number, required: true, min: 0 },
  returnAmount: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },
  profitImpact: { type: Number, required: true, default: 0 },
  customerName: { type: String, default: "", trim: true },
  customerPhone: { type: String, default: "", trim: true },
  reason: { type: String, default: "", trim: true },
  notes: { type: String, default: "", trim: true }
}, { timestamps: true });

schema.index({ createdAt: -1 });
schema.index({ tenantId: 1, orderId: 1, createdAt: -1 });

export default mongoose.model("Return", schema);

schema.index({ tenantId: 1, returnNumber: 1 }, { unique: true });