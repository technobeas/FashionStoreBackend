import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, lowercase: true, trim: true },
  description: { type: String, default: "", maxlength: 5000 },
  image: {
    publicId: String,
    secureUrl: String
  },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0, index: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
}, { timestamps: true });

schema.index({ tenantId: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, isActive: 1, sortOrder: 1, name: 1 });

export default mongoose.model("Collection", schema);
