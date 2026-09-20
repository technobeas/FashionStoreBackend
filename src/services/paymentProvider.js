import crypto from "node:crypto";

/** Provider contract. Replace ManualPaymentProvider with Razorpay/Stripe/etc. without changing controllers. */
class ManualPaymentProvider {
  constructor() { this.name = "manual"; }

  async createCustomer({ tenant }) {
    return { id: `cus_${tenant._id}` };
  }

  async createSubscription({ tenant, plan, billingCycle }) {
    return { id: `sub_${crypto.randomUUID()}`, status: "active", checkoutUrl: null, provider: this.name, planCode: plan.code, billingCycle };
  }

  async cancelSubscription({ subscription }) {
    return { id: subscription.providerSubscriptionId, status: "cancelled" };
  }

  async changeSubscription({ subscription, plan, billingCycle }) {
    return { id: subscription.providerSubscriptionId, status: "active", planCode: plan.code, billingCycle };
  }

  async verifyWebhook() { return true; }
}

const providers = { manual: new ManualPaymentProvider() };

export function getPaymentProvider(name = "manual") {
  const provider = providers[String(name).toLowerCase()];
  if (!provider) throw new Error(`Unsupported billing provider: ${name}`);
  return provider;
}
