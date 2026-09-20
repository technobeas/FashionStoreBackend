import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  publicId: { type: String, required: true },
  secureUrl: { type: String, required: true },
  resourceType: { type: String, enum: ["image", "video"], required: true },
  format: String,
  width: Number,
  height: Number,
  duration: Number,
  bytes: { type: Number, default: 0, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, index: true },
  slug: { type: String, required: true, lowercase: true },
  sku: { type: String, required: true, uppercase: true, index: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, index: true },
  collections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection", index: true }],
  brand: { type: String, trim: true, default: "", index: true },
  subcategory: { type: String, trim: true, default: "", index: true },
  fabric: { type: String, trim: true, default: "", index: true },
  pattern: { type: String, trim: true, default: "", index: true },
  occasion: { type: String, trim: true, default: "", index: true },
  season: { type: String, trim: true, default: "", index: true },
  tags: { type: [String], default: [] },
  careInstructions: { type: String, default: "" },
  sizeChartId: { type: mongoose.Schema.Types.ObjectId, ref: "SizeChart", default: null, index: true },
  sizeChart: {
    name: { type: String, trim: true, default: "" },
    measurements: { type: Map, of: String, default: {} }
  },
  isFeatured: { type: Boolean, default: false, index: true },
  isNewArrival: { type: Boolean, default: false, index: true },
  seoTitle: { type: String, trim: true, default: "" },
  seoDescription: { type: String, trim: true, default: "" },
  description: { type: String, default: "" },
  stockQuantity: { type: Number, default: 1, min: 0 },
  reservedQuantity: { type: Number, min: 0, default: 0 },
  variantEnabled: { type: Boolean, default: false, index: true },
  colors: { type: [String], default: [] },
  sizes: { type: [String], default: [] },
  specifications: { type: Map, of: String, default: {} },
  purchasePrice: { type: Number, required: true, min: 0, select: false },
  sellingPrice: { type: Number, required: true, min: 0, select: false },
  discountedPrice: { type: Number, min: 0, select: false },
  isPriceVisible: { type: Boolean, default: true, index: true },
  isAvailable: { type: Boolean, default: true, index: true },
  isTodaysOffer: { type: Boolean, default: false, index: true },
  isMostDemanded: { type: Boolean, default: false, index: true },
  images: { type: [mediaSchema], default: [] },
  videos: { type: [mediaSchema], default: [] }
}, { timestamps: true });

schema.index({ name: "text", sku: "text" });
schema.index({ tenantId: 1, category: 1, isAvailable: 1 });
schema.index({ tenantId: 1, collections: 1, isAvailable: 1 });
schema.index({ tenantId: 1, brand: 1, isAvailable: 1 });
schema.index({ tenantId: 1, isNewArrival: 1, isAvailable: 1 });
schema.index({ tenantId: 1, isFeatured: 1, isAvailable: 1 });
schema.index({ tenantId: 1, fabric: 1, isAvailable: 1 });
schema.index({ tenantId: 1, occasion: 1, isAvailable: 1 });
schema.index({ tenantId: 1, season: 1, isAvailable: 1 });
schema.index({ tenantId: 1, category: 1, isAvailable: 1 });
schema.index({ tenantId: 1, collections: 1, isAvailable: 1 });
schema.index({ isTodaysOffer: 1, isAvailable: 1 });
schema.index({ isMostDemanded: 1, isAvailable: 1 });

export default mongoose.model("Product", schema);

schema.index({ tenantId: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, sku: 1 }, { unique: true });
schema.index({ tenantId: 1, tags: 1, isAvailable: 1 });
schema.index({ tenantId: 1, subcategory: 1, isAvailable: 1 });
schema.index({ tenantId: 1, pattern: 1, isAvailable: 1 });
schema.index({ tenantId: 1, discountedPrice: 1, sellingPrice: 1, isAvailable: 1 });
schema.index({ tenantId: 1, isAvailable: 1, isTodaysOffer: 1, isNewArrival: 1 });
