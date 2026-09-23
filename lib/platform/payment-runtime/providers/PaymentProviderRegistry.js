const PROVIDERS = Object.freeze({
  credit_card: Object.freeze([
    Object.freeze({
      id: "stripe",
      name: "Stripe",
      method: "credit_card",
      countries: ["*"],
      capabilities: ["checkout", "refund", "settlement_verification"],
      managed: true,
      active: true,
      priority: 100,
    }),
  ]),

  bank_transfer: Object.freeze([
    Object.freeze({
      id: "bank_transfer",
      name: "Bank Transfer",
      method: "bank_transfer",
      countries: ["*"],
      capabilities: ["instructions", "bank_reconciliation"],
      managed: true,
      active: true,
      priority: 100,
    }),
  ]),

  qr_payment: Object.freeze([
    Object.freeze({
      id: "promptpay",
      name: "PromptPay",
      method: "qr_payment",
      countries: ["TH"],
      capabilities: ["qr", "bank_reconciliation"],
      managed: true,
      active: true,
      priority: 100,
    }),
  ]),

  paypal: Object.freeze([
    Object.freeze({
      id: "paypal",
      name: "PayPal",
      method: "paypal",
      countries: ["US", "GB", "EU"],
      capabilities: ["checkout"],
      managed: false,
      active: false,
      priority: 100,
    }),
  ]),
});

function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

function availableInCountry(provider, country) {
  if (provider.countries.includes("*")) return true;
  const requested = String(country ?? "").trim().toUpperCase();
  return Boolean(requested && provider.countries.includes(requested));
}

export function getProvidersForMethod({
  method,
  country = null,
  includeInactive = false,
}) {
  return (PROVIDERS[clean(method)] || [])
    .filter((provider) => includeInactive || provider.active !== false)
    .filter((provider) => availableInCountry(provider, country))
    .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0));
}

export function getPaymentProvider({
  method,
  providerId,
  country = null,
}) {
  const requested = clean(providerId);
  if (!requested) return null;

  return (
    getProvidersForMethod({ method, country })
      .find((provider) => clean(provider.id) === requested) ||
    null
  );
}

export const PaymentProviderRegistry = {
  getProvidersForMethod,
  getPaymentProvider,
};
