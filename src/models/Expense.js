import mongoose from "mongoose";

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Salary",
  "Transport",
  "Packaging",
  "Marketing",
  "Internet",
  "Maintenance",
  "Miscellaneous"
];

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Other"];

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  date: { type: Date, required: true, default: Date.now, index: true },
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "Cash" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true }
}, { timestamps: true });

schema.index({ tenantId: 1, date: -1 });
schema.index({ tenantId: 1, category: 1, date: -1 });
schema.index({ tenantId: 1, paymentMethod: 1, date: -1 });

export { EXPENSE_CATEGORIES, PAYMENT_METHODS };
export default mongoose.model("Expense", schema);
