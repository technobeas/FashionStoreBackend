import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, index: true },
  description: { type: String, default: "" },
  image: {
    publicId: String,
    secureUrl: String
  },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0, index: true }
}, { timestamps: true });

export default mongoose.model("Category", schema);

schema.index({ tenantId: 1, slug: 1 }, { unique: true });