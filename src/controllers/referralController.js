import Customer from "../models/Customer.js";
import Referral from "../models/Referral.js";
import { applyReferral, ensureReferralCode } from "../services/referralService.js";

export async function myCode(req, res) {
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!customer) return res.status(404).json({ message: "Customer not found." });
  await ensureReferralCode(customer);
  res.json({ customerId: customer._id, referralCode: customer.referralCode });
}

export async function apply(req, res) {
  try {
    const referral = await applyReferral({ tenantId: req.tenant._id, referredCustomerId: req.params.id, code: req.body?.code });
    res.status(201).json(referral);
  } catch (e) { res.status(400).json({ message: e.message || "Could not apply referral." }); }
}

export async function list(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { tenantId: req.tenant._id };
  if (req.query.status) filter.status = req.query.status;
  const [items,total] = await Promise.all([
    Referral.find(filter).populate("referrerCustomerId", "name phone referralCode").populate("referredCustomerId", "name phone").sort("-createdAt").skip((page-1)*limit).limit(limit).lean(),
    Referral.countDocuments(filter)
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
}
