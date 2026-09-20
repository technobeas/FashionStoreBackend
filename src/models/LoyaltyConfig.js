import mongoose from "mongoose";

const tierSchema = new mongoose.Schema({
  name: { type: String, enum: ["BRONZE", "SILVER", "GOLD", "PLATINUM"], required: true },
  minLifetimeSpend: { type: Number, min: 0, default: 0 },
  minLifetimePoints: { type: Number, min: 0, default: 0 },
  pointsMultiplier: { type: Number, min: 0, default: 1 }
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  pointsPerRupee: { type: Number, min: 0, max: 10, default: 1 },
  redemptionRupeesPerPoint: { type: Number, min: 0.01, max: 100, default: 0.10 },
  minimumRedeemPoints: { type: Number, min: 0, default: 100 },
  maximumRedeemPercent: { type: Number, min: 0, max: 100, default: 50 },
  expiryDays: { type: Number, min: 0, max: 3650, default: 365 },
  tiers: { type: [tierSchema], default: [
    { name: "BRONZE", minLifetimeSpend: 0, minLifetimePoints: 0, pointsMultiplier: 1 },
    { name: "SILVER", minLifetimeSpend: 10000, minLifetimePoints: 0, pointsMultiplier: 1.25 },
    { name: "GOLD", minLifetimeSpend: 25000, minLifetimePoints: 0, pointsMultiplier: 1.5 },
    { name: "PLATINUM", minLifetimeSpend: 50000, minLifetimePoints: 0, pointsMultiplier: 2 }
  ] }
}, { timestamps: true });

export default mongoose.model("LoyaltyConfig", schema);
