import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  color: { type: String, default: "" },
  size: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, min: 0, default: 0 },
  discountedPrice: { type: Number, min: 0, default: 0 },
  purchasePrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  productDiscountAmount: { type: Number, min: 0, default: 0 }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  method: { type: String, enum: ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other", "Cash on Delivery", "Online Payment"], required: true },
  amount: { type: Number, required: true, min: 0 },
  reference: { type: String, default: "", trim: true },
  note: { type: String, default: "", trim: true }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
  orderNumber: { type: String, required: true, index: true },
  // Optional idempotency key prevents accidental duplicate bills when the
  // browser retries a request after a network interruption.
  idempotencyKey: { type: String, default: "", trim: true },
  publicTrackingToken: { type: String, default: null, trim: true, index: true },
  customerName: { type: String, default: "", trim: true },
  customerPhone: { type: String, default: "", trim: true },
  items: { type: [itemSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  // Discount already included in product prices: sellingPrice -> discountedPrice.
  productDiscountAmount: { type: Number, min: 0, default: 0 },
  // Extra discount applied when the admin manually lowers Final Total.
  additionalDiscountAmount: { type: Number, min: 0, default: 0 },
  // Complete discount = product discount + additional discount.
  discountAmount: { type: Number, required: true, min: 0, default: 0 },
  loyaltyPointsRedeemed: { type: Number, min: 0, default: 0 },
  loyaltyDiscountAmount: { type: Number, min: 0, default: 0 },
  discountedSubtotal: { type: Number, min: 0, default: 0 },
  finalTotal: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0, default: 0 },
  profit: { type: Number, required: true, default: 0 },
  paymentMethod: { type: String, enum: ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other", "Cash on Delivery", "Online Payment", "Split Payment"], default: "Cash" },
  payments: { type: [paymentSchema], default: [] },
  paymentStatus: { type: String, enum: ["paid", "partial", "credit", "pending", "failed", "refunded"], default: "paid", index: true },
  paidAmount: { type: Number, min: 0, default: 0 },
  dueAmount: { type: Number, min: 0, default: 0 },
  refundedAmount: { type: Number, min: 0, default: 0 },
  refund: { amount: { type: Number, min: 0, default: 0 }, status: { type: String, enum: ["none", "pending", "refunded"], default: "none" }, processedAt: { type: Date, default: null }, note: { type: String, default: "" } },
  status: { type: String, enum: ["paid", "cancelled"], default: "paid", index: true },
  source: { type: String, enum: ["POS", "ONLINE"], default: "POS", index: true },
  fulfillmentStatus: { type: String, enum: ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"], default: "pending", index: true },
  delivery: {
    addressLine1: { type: String, default: "", trim: true, maxlength: 250 },
    addressLine2: { type: String, default: "", trim: true, maxlength: 250 },
    landmark: { type: String, default: "", trim: true, maxlength: 160 },
    city: { type: String, default: "", trim: true, maxlength: 100 },
    state: { type: String, default: "", trim: true, maxlength: 100 },
    postalCode: { type: String, default: "", trim: true, maxlength: 20 },
    country: { type: String, default: "India", trim: true, maxlength: 80 },
    instructions: { type: String, default: "", trim: true, maxlength: 500 }
  },
  contact: {
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    whatsapp: { type: String, default: "", trim: true, maxlength: 30 }
  },
  deliveryTracking: {
    trackingId: { type: String, default: "", trim: true, maxlength: 120 },
    courierName: { type: String, default: "", trim: true, maxlength: 120 },
    trackingUrl: { type: String, default: "", trim: true, maxlength: 500 },
    updatedAt: { type: Date, default: null }
  },
  onlineConsent: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: "v1" },
    privacyVersion: { type: String, default: "v1" },
    returnPolicyVersion: { type: String, default: "online-no-return-v1" },
    ip: { type: String, default: "", maxlength: 100 },
    userAgent: { type: String, default: "", maxlength: 500 }
  },
  returnPolicy: {
    eligible: { type: Boolean, default: true },
    snapshot: { type: String, default: "" }
  },
  returnStatus: { type: String, enum: ["none", "partial", "full"], default: "none", index: true },
  returnedAmount: { type: Number, min: 0, default: 0 },
  notes: { type: String, default: "" }
}, { timestamps: true });

schema.index({ createdAt: -1 });

export default mongoose.model("Order", schema);

schema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $ne: "" } } });
schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, source: 1, fulfillmentStatus: 1, createdAt: -1 });
schema.index({ tenantId: 1, "deliveryTracking.trackingId": 1 });
schema.index({ tenantId: 1, publicTrackingToken: 1 }, { unique: true, sparse: true });