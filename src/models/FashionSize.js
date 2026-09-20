import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  key: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  sortOrder: { type: Number, default: 0, index: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

schema.index({ tenantId: 1, key: 1 }, { unique: true });
schema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });

export default mongoose.model("FashionSize", schema);
