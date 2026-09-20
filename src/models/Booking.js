import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  bookingNumber: { type: String, required: true, trim: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", default: null },
  productName: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true },
  color: { type: String, default: "" },
  size: { type: String, default: "" },
  quantity: { type: Number, min: 1, default: 1 },
  unitPrice: { type: Number, min: 0, default: 0 },
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  customerPhone: { type: String, required: true, trim: true, maxlength: 30 },
  contact: {
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    whatsapp: { type: String, default: "", trim: true, maxlength: 30 }
  },
  status: { type: String, enum: ["active", "converted", "released", "cancelled", "expired"], default: "active", index: true },
  expiresAt: { type: Date, required: true, index: true },
  consent: {
    accepted: { type: Boolean, required: true, default: false },
    acceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: "v1" },
    privacyVersion: { type: String, default: "v1" },
    contactPolicyVersion: { type: String, default: "booking-contact-v1" },
    ip: { type: String, default: "", maxlength: 100 },
    userAgent: { type: String, default: "", maxlength: 500 }
  },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
  notes: { type: String, default: "", maxlength: 500 },
  releasedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ tenantId: 1, bookingNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, expiresAt: 1 });
schema.index({ tenantId: 1, customerPhone: 1, createdAt: -1 });

export default mongoose.model("Booking", schema);
