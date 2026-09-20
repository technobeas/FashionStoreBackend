import crypto from "crypto";
import Customer from "../models/Customer.js";
import Referral from "../models/Referral.js";
import { rewardReferral } from "./campaignService.js";

export function makeReferralCode(name = "CUSTOMER") {
  const base = String(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "CUSTOMER";
  return `${base}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function ensureReferralCode(customer) {
  if (customer.referralCode) return customer;
  for (let i = 0; i < 5; i++) {
    try {
      customer.referralCode = makeReferralCode(customer.name);
      await customer.save();
      return customer;
    } catch (e) {
      if (e?.code !== 11000) throw e;
    }
  }
  throw new Error("Could not generate referral code.");
}

export async function applyReferral({ tenantId, referredCustomerId, code }) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) throw new Error("Referral code is required.");
  const customer = await Customer.findOne({ _id: referredCustomerId, tenantId });
  if (!customer) throw new Error("Customer not found.");
  if (customer.referredBy) throw new Error("Customer already has a referrer.");
  const referrer = await Customer.findOne({ tenantId, referralCode: normalized });
  if (!referrer || String(referrer._id) === String(customer._id)) throw new Error("Invalid referral code.");
  const referral = await Referral.create({
    tenantId, referrerCustomerId: referrer._id, referredCustomerId: customer._id, code: normalized
  });
  customer.referredBy = referrer._id;
  await customer.save();
  return referral;
}

export async function qualifyReferralForOrder({ tenantId, customerId, orderId, referrerPoints = 0, referredPoints = 0 }) {
  const referral = await Referral.findOne({ tenantId, referredCustomerId: customerId, status: "pending" });
  if (!referral) return null;
  return rewardReferral({ referral, referrerPoints, referredPoints, orderId });
}
