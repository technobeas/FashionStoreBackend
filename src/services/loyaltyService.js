import LoyaltyConfig from "../models/LoyaltyConfig.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Customer from "../models/Customer.js";

export async function getLoyaltyConfig(tenantId) {
  let config = await LoyaltyConfig.findOne({ tenantId }).lean();
  if (!config) config = await LoyaltyConfig.create({ tenantId });
  return config;
}

function resolveTier(config, lifetimeSpend, lifetimePoints) {
  const tiers = [...(config.tiers || [])].sort((a, b) =>
    Math.max(Number(b.minLifetimeSpend || 0), Number(b.minLifetimePoints || 0)) -
    Math.max(Number(a.minLifetimeSpend || 0), Number(a.minLifetimePoints || 0))
  );
  return tiers.find(t =>
    lifetimeSpend >= Number(t.minLifetimeSpend || 0) &&
    lifetimePoints >= Number(t.minLifetimePoints || 0)
  )?.name || "BRONZE";
}

export async function refreshTier(customer, config = null) {
  const cfg = config || await getLoyaltyConfig(customer.tenantId);
  const tier = resolveTier(cfg, Number(customer.totalSpent || 0), Number(customer.loyaltyLifetimeEarned || 0));
  if (customer.loyaltyTier !== tier) {
    customer.loyaltyTier = tier;
    await customer.save();
  }
  return tier;
}

export async function earnPoints({ tenantId, customerId, orderId, amount, createdBy = null }) {
  const config = await getLoyaltyConfig(tenantId);
  if (!config.enabled || Number(amount) <= 0) return null;

  const customer = await Customer.findOne({ _id: customerId, tenantId });
  if (!customer) return null;

  const existing = orderId ? await LoyaltyTransaction.findOne({ tenantId, customerId, orderId, type: "EARN" }) : null;
  if (existing) return existing;

  const multiplier = Number((config.tiers || []).find(t => t.name === customer.loyaltyTier)?.pointsMultiplier || 1);
  const points = Math.floor(Number(amount) * Number(config.pointsPerRupee || 0) * multiplier);
  if (points <= 0) return null;

  const balanceAfter = Number(customer.loyaltyPointsBalance || 0) + points;
  const expiresAt = Number(config.expiryDays || 0) > 0
    ? new Date(Date.now() + Number(config.expiryDays) * 86400000)
    : null;

  const tx = await LoyaltyTransaction.create({
    tenantId, customerId, orderId, type: "EARN", points, balanceAfter,
    source: "ORDER", expiresAt, createdBy
  });
  customer.loyaltyPointsBalance = balanceAfter;
  customer.loyaltyLifetimeEarned = Number(customer.loyaltyLifetimeEarned || 0) + points;
  await customer.save();
  await refreshTier(customer, config);
  return tx;
}

export async function redeemPoints({ tenantId, customerId, points, note = "", createdBy = null }) {
  const requested = Math.floor(Number(points));
  if (!Number.isFinite(requested) || requested <= 0) throw new Error("Enter a valid number of loyalty points.");

  const config = await getLoyaltyConfig(tenantId);
  if (!config.enabled) throw new Error("Loyalty program is disabled.");
  if (requested < Number(config.minimumRedeemPoints || 0)) throw new Error(`Minimum redemption is ${config.minimumRedeemPoints} points.`);

  const customer = await Customer.findOne({ _id: customerId, tenantId });
  if (!customer) throw new Error("Customer not found.");
  if (requested > Number(customer.loyaltyPointsBalance || 0)) throw new Error("Insufficient loyalty points.");

  const balanceAfter = Number(customer.loyaltyPointsBalance) - requested;
  const value = Number((requested * Number(config.redemptionRupeesPerPoint || 0)).toFixed(2));

  const tx = await LoyaltyTransaction.create({
    tenantId, customerId, type: "REDEEM", points: -requested, balanceAfter,
    source: "MANUAL", note: String(note || "").slice(0, 500), createdBy
  });
  customer.loyaltyPointsBalance = balanceAfter;
  customer.loyaltyLifetimeRedeemed = Number(customer.loyaltyLifetimeRedeemed || 0) + requested;
  await customer.save();
  return { tx, points: requested, value, balanceAfter };
}

export async function adjustPoints({ tenantId, customerId, points, note = "", createdBy = null }) {
  const delta = Math.trunc(Number(points));
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Points adjustment must be a non-zero number.");
  const customer = await Customer.findOne({ _id: customerId, tenantId });
  if (!customer) throw new Error("Customer not found.");
  const balanceAfter = Number(customer.loyaltyPointsBalance || 0) + delta;
  if (balanceAfter < 0) throw new Error("Adjustment cannot make the loyalty balance negative.");

  const tx = await LoyaltyTransaction.create({
    tenantId, customerId, type: "ADJUST", points: delta, balanceAfter,
    source: "MANUAL", note: String(note || "").slice(0, 500), createdBy
  });
  customer.loyaltyPointsBalance = balanceAfter;
  if (delta > 0) customer.loyaltyLifetimeEarned = Number(customer.loyaltyLifetimeEarned || 0) + delta;
  else customer.loyaltyLifetimeRedeemed = Number(customer.loyaltyLifetimeRedeemed || 0) + Math.abs(delta);
  await customer.save();
  return tx;
}

export async function expirePoints(tenantId = null) {
  const now = new Date();
  const filter = { expiresAt: { $lte: now }, points: { $gt: 0 }, type: "EARN" };
  if (tenantId) filter.tenantId = tenantId;
  const earns = await LoyaltyTransaction.find(filter).lean();
  let expired = 0;
  for (const earn of earns) {
    const marker = `Expired earn ${earn._id}`;
    if (await LoyaltyTransaction.exists({ tenantId: earn.tenantId, customerId: earn.customerId, source: "EXPIRY", note: marker })) continue;
    const customer = await Customer.findOne({ _id: earn.customerId, tenantId: earn.tenantId });
    if (!customer) continue;
    const delta = Math.min(Number(earn.points || 0), Number(customer.loyaltyPointsBalance || 0));
    if (delta <= 0) {
      await LoyaltyTransaction.create({
        tenantId: earn.tenantId, customerId: earn.customerId, type: "EXPIRE",
        points: 0, balanceAfter: Number(customer.loyaltyPointsBalance || 0),
        source: "EXPIRY", note: marker
      });
      continue;
    }
    customer.loyaltyPointsBalance -= delta;
    await customer.save();
    await LoyaltyTransaction.create({
      tenantId: earn.tenantId, customerId: earn.customerId, type: "EXPIRE",
      points: -delta, balanceAfter: Number(customer.loyaltyPointsBalance || 0),
      source: "EXPIRY", note: marker
    });
    expired += delta;
  }
  return expired;
}
