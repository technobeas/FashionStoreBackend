import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, lowercase: true, default: "" },
  address: { type: String, trim: true, default: "" },
  gstNumber: { type: String, trim: true, uppercase: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

schema.index({ tenantId: 1, name: 1 });
schema.index({ tenantId: 1, phone: 1 });
export default mongoose.model("Supplier", schema);
