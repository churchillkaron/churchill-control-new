import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function zeroDecimal(currency) {
  return new Set([
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
  ]).has(upper(currency));
}

function fromMinorUnits(currency, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new Error("PAYMENT_SETTLEMENT_AMOUNT_INVALID");
  }
  return value / (zeroDecimal(currency) ? 1 : 100);
}

function settledAt(intent) {
  const charge = intent?.latest_charge;
  const seconds = Number(
    typeof charge === "object" ? charge?.created : intent?.created,
  );
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("PAYMENT_SETTLEMENT_TIME_REQUIRED");
  }
  return new Date(seconds * 1000).toISOString();
}
export const StripePaymentIntentVerifier = {
  key: "stripe.payment_intent",
  name: "Stripe PaymentIntent verification",

  async verify({ payment, sourceReference }) {
    if (!payment?.id || !payment?.organization_id) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const paymentIntentId = clean(sourceReference);
    if (!paymentIntentId) {
      throw new Error("PAYMENT_SETTLEMENT_SOURCE_REFERENCE_REQUIRED");
    }

    const connectedAccountId = clean(
      payment?.metadata?.rail_action?.provider_account_id,
    );

    const intent = await StripeProvider.retrievePaymentIntent({
      organizationId: payment.organization_id,
      paymentIntentId,
      connectedAccountId: connectedAccountId || null,
    });

    if (clean(intent?.status).toLowerCase() !== "succeeded") {
      throw new Error("PAYMENT_PROVIDER_NOT_SETTLED");
    }

    if (clean(intent?.metadata?.domain) !== "avantiqo_payment") {
      throw new Error("PAYMENT_PROVIDER_DOMAIN_MISMATCH");
    }

    if (clean(intent?.metadata?.paymentId) !== clean(payment.id)) {
      throw new Error("PAYMENT_PROVIDER_PAYMENT_ID_MISMATCH");
    }
    if (
      clean(intent?.metadata?.organizationId) !==
      clean(payment.organization_id)
    ) {
      throw new Error("PAYMENT_SETTLEMENT_ORGANIZATION_MISMATCH");
    }

    const currency = upper(intent?.currency);
    const amount = fromMinorUnits(currency, intent?.amount_received);

    return {
      provider: "stripe",
      provider_reference: intent.id,
      amount,
      currency,
      settled_at: settledAt(intent),
      verification_source: "stripe.payment_intent",
      metadata: {
        stripe_payment_intent_id: intent.id,
        stripe_latest_charge_id:
          typeof intent?.latest_charge === "string"
            ? intent.latest_charge
            : intent?.latest_charge?.id || null,
        payment_method_types: Array.isArray(intent?.payment_method_types)
          ? intent.payment_method_types
          : [],
      },
    };
  },
};
