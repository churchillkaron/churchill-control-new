import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.stripe = {
  id: "stripe",
  connectionModel: "managed",
  name: "Stripe",
  category: "payments",
  capabilities: [
    "merchant.account.create",
    "merchant.account.read",
    "merchant.account.onboarding.create",
    "billing.customer.ensure",
    "billing.subscription.checkout.create",
    "billing.portal.session.create",
    "billing.subscription.read",
    "payments.checkout.create",
    "payments.checkout.read",
    "payments.intent.read",
    "payments.refund.create",
    "billing.webhook.verify",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "stripe",
  runtimeAvailable: true,
  active: true,
  metadata: {
    supplier_billing_required: false,
    api_family: "STRIPE_API",
    platform_managed_billing: true,
  },
};
