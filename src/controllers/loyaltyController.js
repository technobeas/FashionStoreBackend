import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import LoyaltyConfig from "../models/LoyaltyConfig.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { adjustPoints, getLoyaltyConfig, redeemPoints } from "../services/loyaltyService.js";

function clean(v, max = 500) { return String(v ?? "").trim().slice(0, max); }

export async function config(req, res) {
  res.json(await getLoyaltyConfig(req.tenant._id));
}

export async function updateConfig(req, res) {
  const body = req.body || {};
  const data = {
    enabled: body.enabled !== false,
    pointsPerRupee: Math.min(Math.max(Number(body.pointsPerRupee ?? 1), 0), 10),
    redemptionRupeesPerPoint: Math.min(Math.max(Number(body.redemptionRupeesPerPoint ?? 0.1), 0.01), 100),
    minimumRedeemPoints: Math.max(Math.floor(Number(body.minimumRedeemPoints ?? 100)), 0),
    maximumRedeemPercent: Math.min(Math.max(Number(body.maximumRedeemPercent ?? 50), 0), 100),
    expiryDays: Math.min(Math.max(Math.floor(Number(body.expiryDays ?? 365)), 0), 3650)
  };
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 4).map(t => ({
    name: String(t?.name || "").toUpperCase(),
    minLifetimeSpend: Math.max(Number(t?.minLifetimeSpend || 0), 0),
    minLifetimePoints: Math.max(Number(t?.minLifetimePoints || 0), 0),
    pointsMultiplier: Math.min(Math.max(Number(t?.pointsMultiplier || 1), 0), 10)
  })) : undefined;
  if (tiers) data.tiers = tiers;
  const saved = await LoyaltyConfig.findOneAndUpdate(
    { tenantId: req.tenant._id }, { $set: data }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.json(saved);
}

export async function summary(req, res) {
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
  if (!customer) return res.status(404).json({ message: "Customer not found." });
  const config = await getLoyaltyConfig(req.tenant._id);
  const transactions = await LoyaltyTransaction.find({ tenantId: req.tenant._id, customerId: customer._id })
    .sort("-createdAt").limit(100).lean();
  const valuePerPoint = Number(config.redemptionRupeesPerPoint || 0);
  res.json({
    customer: {
      _id: customer._id, name: customer.name, phone: customer.phone,
      loyaltyPointsBalance: customer.loyaltyPointsBalance || 0,
      loyaltyLifetimeEarned: customer.loyaltyLifetimeEarned || 0,
      loyaltyLifetimeRedeemed: customer.loyaltyLifetimeRedeemed || 0,
      loyaltyTier: customer.loyaltyTier || "BRONZE"
    },
    config,
    redeemableValue: Number(((customer.loyaltyPointsBalance || 0) * valuePerPoint).toFixed(2)),
    transactions
  });
}

export async function redeem(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid customer." });
  try {
    const result = await redeemPoints({
      tenantId: req.tenant._id, customerId: req.params.id,
      points: req.body?.points, note: clean(req.body?.note), createdBy: req.admin?._id || null
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message || "Could not redeem points." });
  }
}

export async function adjust(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid customer." });
  try {
    const tx = await adjustPoints({
      tenantId: req.tenant._id, customerId: req.params.id,
      points: req.body?.points, note: clean(req.body?.note), createdBy: req.admin?._id || null
    });
    res.status(201).json(tx);
  } catch (e) {
    res.status(400).json({ message: e.message || "Could not adjust points." });
  }
}
