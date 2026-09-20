import mongoose from "mongoose";

const lineSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  unitAmount: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true },
  providerInvoiceId: { type: String, default: null },
  status: { type: String, enum: ["draft", "open", "paid", "void", "uncollectible"], default: "open", index: true },
  currency: { type: String, default: "INR", uppercase: true },
  billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  dueAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  subtotal: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
  lineItems: { type: [lineSchema], default: [] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

schema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
schema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model("Invoice", schema);
