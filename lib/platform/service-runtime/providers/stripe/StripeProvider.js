import Stripe from "stripe";
import "./StripeCredentialRegistration.js";
import { resolveProviderCredential } from "../ProviderCredentialRuntime.js";

let cachedApiKey = null;
let cachedClient = null;

function text(value) {
  return String(value ?? "").trim();
}

function customerPayload({ organizationId, email, name, metadata = {} }) {
  return {
    ...(text(email) ? { email: text(email) } : {}),
    ...(text(name) ? { name: text(name) } : {}),
    metadata: {
      ...metadata,
      organizationId: text(organizationId),
      domain: "avantiqo_billing",
    },
  };
}

function clientForApiKey(apiKey) {
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (cachedClient && cachedApiKey === apiKey) return cachedClient;
  cachedApiKey = apiKey;
  cachedClient = new Stripe(apiKey);
  return cachedClient;
}

async function managedCredential(organizationId) {
  const credential = await resolveProviderCredential({
    organization_id: organizationId,
    provider: "stripe",
  });
  if (!credential?.api_key) {
    throw new Error("STRIPE_MANAGED_CREDENTIAL_NOT_CONFIGURED");
  }
  return credential;
}

async function managedClient(organizationId) {
  const credential = await managedCredential(organizationId);
  return {
    stripe: clientForApiKey(credential.api_key),
    credential,
  };
}

export async function createStripeConnectedAccount({
  organizationId,
  country,
  email = null,
  businessName = null,
  legalEntityId = null,
}) {
  const { stripe } = await managedClient(organizationId);
  const normalizedCountry = text(country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
    throw new Error("STRIPE_CONNECTED_ACCOUNT_COUNTRY_REQUIRED");
  }

  return stripe.accounts.create({
    type: "express",
    country: normalizedCountry,
    ...(text(email) ? { email: text(email) } : {}),
    ...(text(businessName)
      ? { business_profile: { name: text(businessName) } }
      : {}),
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      domain: "avantiqo_organization_payments",
      organizationId: text(organizationId),
      legalEntityId: text(legalEntityId),
    },
  }, {
    idempotencyKey:
      `avantiqo:merchant-account:${organizationId}:${text(legalEntityId) || "default"}`,
  });
}

export async function retrieveStripeConnectedAccount({
  organizationId,
  connectedAccountId,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(connectedAccountId).startsWith("acct_")) {
    throw new Error("STRIPE_CONNECTED_ACCOUNT_REQUIRED");
  }
  return stripe.accounts.retrieve(text(connectedAccountId));
}

export async function createStripeConnectedAccountOnboardingLink({
  organizationId,
  connectedAccountId,
  refreshUrl,
  returnUrl,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(connectedAccountId).startsWith("acct_")) {
    throw new Error("STRIPE_CONNECTED_ACCOUNT_REQUIRED");
  }

  return stripe.accountLinks.create({
    account: text(connectedAccountId),
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
    collection_options: {
      fields: "currently_due",
      future_requirements: "omit",
    },
  });
}

export async function ensureStripeCustomer({
  organizationId,
  customerId = null,
  email = null,
  name = null,
  metadata = {},
}) {
  const { stripe } = await managedClient(organizationId);
  const payload = customerPayload({ organizationId, email, name, metadata });

  if (text(customerId)) {
    const customer = await stripe.customers.retrieve(text(customerId));
    if (!customer?.deleted) {
      return stripe.customers.update(customer.id, payload);
    }
  }

  return stripe.customers.create(payload, {
    idempotencyKey: `avantiqo:billing:customer:${organizationId}`,
  });
}

export async function createStripeSubscriptionCheckout({
  organizationId,
  customerId,
  priceId = null,
  priceKey = null,
  lineItems = null,
  billingCycle = null,
  moduleIds = [],
  successUrl,
  cancelUrl,
  idempotencyKey,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(customerId)) throw new Error("STRIPE_CUSTOMER_REQUIRED");

  const normalizedLineItems = Array.isArray(lineItems) && lineItems.length
    ? lineItems.map((item) => ({
        price: text(item?.price),
        quantity: Number(item?.quantity || 1),
      }))
    : [{ price: text(priceId), quantity: 1 }];

  if (
    !normalizedLineItems.length ||
    normalizedLineItems.some(
      (item) =>
        !item.price.startsWith("price_") ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    throw new Error("STRIPE_PRICE_NOT_CONFIGURED");
  }

  const metadata = {
    domain: "avantiqo_subscription",
    organizationId: text(organizationId),
    priceKey: text(priceKey),
    billingCycle: text(billingCycle),
    moduleIds: Array.isArray(moduleIds)
      ? moduleIds.map(text).filter(Boolean).join(",")
      : "",
  };

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: text(customerId),
    line_items: normalizedLineItems,
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    metadata,
    subscription_data: { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, idempotencyKey ? { idempotencyKey } : undefined);
}

export async function createStripePaymentCheckout({
  organizationId,
  session,
  idempotencyKey = null,
  connectedAccountId = null,
}) {
  const { stripe } = await managedClient(organizationId);
  const options = {
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(text(connectedAccountId)
      ? { stripeAccount: text(connectedAccountId) }
      : {}),
  };
  return stripe.checkout.sessions.create(
    session,
    Object.keys(options).length ? options : undefined,
  );
}

export async function retrieveStripeCheckoutSession({
  organizationId,
  sessionId,
  connectedAccountId = null,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(sessionId)) throw new Error("STRIPE_CHECKOUT_SESSION_REQUIRED");
  return stripe.checkout.sessions.retrieve(
    text(sessionId),
    {},
    text(connectedAccountId)
      ? { stripeAccount: text(connectedAccountId) }
      : undefined,
  );
}

export async function retrieveStripePaymentIntent({
  organizationId,
  paymentIntentId,
  connectedAccountId = null,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(paymentIntentId)) throw new Error("STRIPE_PAYMENT_INTENT_REQUIRED");
  return stripe.paymentIntents.retrieve(
    text(paymentIntentId),
    { expand: ["latest_charge"] },
    text(connectedAccountId)
      ? { stripeAccount: text(connectedAccountId) }
      : undefined,
  );
}

export async function createStripeRefund({
  organizationId,
  refund,
  idempotencyKey = null,
}) {
  const { stripe } = await managedClient(organizationId);
  return stripe.refunds.create(
    refund,
    idempotencyKey ? { idempotencyKey } : undefined,
  );
}

export async function createStripeBillingPortalSession({
  organizationId,
  customerId,
  returnUrl,
}) {
  const { stripe, credential } = await managedClient(organizationId);
  if (!text(customerId)) throw new Error("STRIPE_CUSTOMER_REQUIRED");

  const configurationId = text(
    credential?.billing_portal_configuration_id,
  );
  if (!configurationId.startsWith("bpc_")) {
    throw new Error("STRIPE_BILLING_PORTAL_CONFIGURATION_NOT_CONFIGURED");
  }

  return stripe.billingPortal.sessions.create({
    customer: text(customerId),
    configuration: configurationId,
    return_url: returnUrl,
  });
}

export async function retrieveStripeSubscription({
  organizationId,
  subscriptionId,
}) {
  const { stripe } = await managedClient(organizationId);
  if (!text(subscriptionId)) throw new Error("STRIPE_SUBSCRIPTION_REQUIRED");
  return stripe.subscriptions.retrieve(text(subscriptionId));
}

export function verifyStripeWebhook({ rawBody, signature }) {
  const apiKey = text(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = text(process.env.STRIPE_WEBHOOK_SECRET);
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  if (!text(signature)) throw new Error("STRIPE_SIGNATURE_REQUIRED");
  return clientForApiKey(apiKey).webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );
}

export async function executeStripeProvider(input = {}) {
  const capability = text(input.capability);
  const organizationId = text(input.context?.organization_id || input.organizationId);

  if (capability === "merchant.account.create") {
    return createStripeConnectedAccount({ organizationId, ...(input.payload || input) });
  }
  if (capability === "merchant.account.read") {
    return retrieveStripeConnectedAccount({ organizationId, ...(input.payload || input) });
  }
  if (capability === "merchant.account.onboarding.create") {
    return createStripeConnectedAccountOnboardingLink({ organizationId, ...(input.payload || input) });
  }
  if (capability === "billing.customer.ensure") {
    return ensureStripeCustomer({ organizationId, ...(input.payload || input) });
  }
  if (capability === "billing.subscription.checkout.create") {
    return createStripeSubscriptionCheckout({ organizationId, ...(input.payload || input) });
  }
  if (capability === "billing.portal.session.create") {
    return createStripeBillingPortalSession({ organizationId, ...(input.payload || input) });
  }
  if (capability === "payments.checkout.create") {
    return createStripePaymentCheckout({ organizationId, ...(input.payload || input) });
  }
  if (capability === "payments.checkout.read") {
    return retrieveStripeCheckoutSession({ organizationId, ...(input.payload || input) });
  }
  if (capability === "payments.refund.create") {
    return createStripeRefund({ organizationId, ...(input.payload || input) });
  }
  if (capability === "payments.intent.read") {
    return retrieveStripePaymentIntent({ organizationId, ...(input.payload || input) });
  }
  if (capability === "billing.subscription.read") {
    return retrieveStripeSubscription({ organizationId, ...(input.payload || input) });
  }

  throw new Error(`STRIPE_CAPABILITY_NOT_SUPPORTED:${capability || "missing"}`);
}

export const StripeProvider = {
  execute: executeStripeProvider,
  createConnectedAccount: createStripeConnectedAccount,
  retrieveConnectedAccount: retrieveStripeConnectedAccount,
  createConnectedAccountOnboardingLink: createStripeConnectedAccountOnboardingLink,
  ensureCustomer: ensureStripeCustomer,
  createSubscriptionCheckout: createStripeSubscriptionCheckout,
  createPaymentCheckout: createStripePaymentCheckout,
  retrieveCheckoutSession: retrieveStripeCheckoutSession,
  retrievePaymentIntent: retrieveStripePaymentIntent,
  createRefund: createStripeRefund,
  createBillingPortalSession: createStripeBillingPortalSession,
  retrieveSubscription: retrieveStripeSubscription,
  verifyWebhook: verifyStripeWebhook,
};
