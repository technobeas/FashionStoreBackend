import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
  status: { type: String, enum: ["trialing", "active", "past_due", "suspended", "cancelled", "expired"], default: "trialing" },
  startedAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  planCode: { type: String, default: "starter" },
  notes: { type: String, default: "" }
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  logo: { publicId: String, secureUrl: String },
  status: { type: String, enum: ["active", "trial", "suspended", "cancelled"], default: "active", index: true },
  plan: { type: String, default: "starter", index: true },
  subscription: { type: subscriptionSchema, default: () => ({}) },
  featureOverrides: {
    enabled: { type: [String], default: [] },
    disabled: { type: [String], default: [] }
  },
  developerBranding: {
    enabled: { type: Boolean, default: true },
    name: { type: String, default: "Noorie Collection Developers", trim: true },
    text: { type: String, default: "Powered by our fashion commerce platform.", trim: true },
    website: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    whatsapp: { type: String, default: "", trim: true }
  }
}, { timestamps: true });

export default mongoose.model("Tenant", schema);
