import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  publicId: { type: String, default: "" },
  secureUrl: { type: String, default: "" }
}, { _id: false });

const bannerSchema = new mongoose.Schema({
  image: { type: imageSchema, default: () => ({}) },
  title: { type: String, default: "", maxlength: 160 },
  description: { type: String, default: "", maxlength: 500 },
  link: { type: String, default: "" },
  active: { type: Boolean, default: true }
}, { _id: true });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },

  // Legacy fields are retained for backwards compatibility.
  shopName: { type: String, default: "Ladies Fashion Store", trim: true },
  logo: imageSchema,
  description: { type: String, default: "" },
  comingSoon: {
    enabled: { type: Boolean, default: false },
    title: { type: String, default: "Coming Soon" },
    message: { type: String, default: "We are getting ready. Subscribe to notifications and we will let you know when we launch." }
  },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  whatsapp: { type: String, default: "" },
  googleMapsUrl: { type: String, default: "" },
  openingHours: { type: String, default: "" },
  socialLinks: { type: Map, of: String, default: {} },
  heroContent: {
    title: { type: String, default: "Discover your style" },
    description: { type: String, default: "Discover beautiful ladies fashion, dresses and new arrivals." },
    image: imageSchema
  },

  branding: {
    logo: imageSchema,
    favicon: imageSchema,
    primaryColor: { type: String, default: "#111827" },
    secondaryColor: { type: String, default: "#f59e0b" },
    accentColor: { type: String, default: "#e11d48" },
    font: { type: String, default: "Inter" },
    theme: { type: String, enum: ["light", "dark", "auto"], default: "light" }
  },

  homepage: {
    hero: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      image: imageSchema,
      buttonText: { type: String, default: "Explore Collection" },
      buttonLink: { type: String, default: "/categories" }
    },
    banners: { type: [bannerSchema], default: [] },
    featuredCollections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    featuredProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    showNewArrivals: { type: Boolean, default: true },
    showOffers: { type: Boolean, default: true },
    showFeaturedProducts: { type: Boolean, default: true },
    showFeaturedCollections: { type: Boolean, default: true }
  },

  contact: {
    phone: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    googleMapsUrl: { type: String, default: "" },
    socialLinks: { type: Map, of: String, default: {} }
  },

  business: {
    openingHours: { type: String, default: "" },
    timezone: { type: String, default: "Asia/Kolkata" }
  },

  policies: {
    terms: { type: String, default: "" },
    privacy: { type: String, default: "" },
    returnPolicy: { type: String, default: "" },
    shippingInformation: { type: String, default: "" }
  }
}, { timestamps: true });

schema.index({ tenantId: 1, "branding.theme": 1 });

export default mongoose.model("ShopSettings", schema);
