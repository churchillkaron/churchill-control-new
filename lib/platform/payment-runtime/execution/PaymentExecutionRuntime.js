import { normalizePaymentMethod } from "../adapters/PaymentMethodAdapter";
import { createPaymentTransaction } from "../documents/PaymentTransaction";
import { PaymentRailExecutionRuntime } from "../providers/runtime/PaymentRailExecutionRuntime";
import { PaymentConfigurationRepository } from "../repositories/PaymentConfigurationRepository";
import { PaymentTransactionRepository } from "../repositories/PaymentTransactionRepository";
import { PaymentProviderResolver } from "../resolver/PaymentProviderResolver";

const FORBIDDEN_CARD_FIELDS = new Set([
  "card_number",
  "cardnumber",
  "pan",
  "cvc",
  "cvv",
  "security_code",
  "expiry",
  "expiration",
]);

function assertNoRawCardData(value, path = "metadata") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawCardData(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CARD_FIELDS.has(String(key).trim().toLowerCase())) {
      throw new Error("RAW_CARD_DATA_NOT_ACCEPTED");
    }
    assertNoRawCardData(nested, `${path}.${key}`);
  }
}
function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }
  return amount;
}

function cleanCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("PAYMENT_CURRENCY_INVALID");
  }
  return currency;
}

function compactPaymentReference(paymentId) {
  const hex = String(paymentId || "").replace(/[^a-fA-F0-9]/g, "");
  if (hex.length < 16) {
    throw new Error("PAYMENT_REFERENCE_ID_INVALID");
  }
  return `AVQ${hex.slice(0, 16).toUpperCase()}`;
}

export async function createPayment({
  organizationId,
  entityId = null,
  partyId = null,
  method,
  country = null,
  amount,
  currency,
  metadata = {},
  returnUrl,
}) {
  assertNoRawCardData(metadata);

  const normalizedMethod = normalizePaymentMethod(method);
  if (!normalizedMethod) throw new Error("PAYMENT_METHOD_REQUIRED");

  const normalizedAmount = positiveAmount(amount);
  const normalizedCurrency = cleanCurrency(currency);
  const paymentConfiguration = await PaymentConfigurationRepository.resolve({
    organizationId,
    paymentMethod: normalizedMethod,
    country,
    currency: normalizedCurrency,
  });
  if (!paymentConfiguration) {
    throw new Error("PAYMENT_METHOD_NOT_CONFIGURED");
  }

  const configuration =
    paymentConfiguration.configuration &&
    typeof paymentConfiguration.configuration === "object" &&
    !Array.isArray(paymentConfiguration.configuration)
      ? paymentConfiguration.configuration
      : {};

  const provider = PaymentProviderResolver.resolvePaymentProvider({
    method: normalizedMethod,
    country,
    preferredProvider:
      configuration.provider ||
      configuration.provider_id ||
      configuration.rail_provider ||
      null,
  });

  const transaction = createPaymentTransaction({
    organization_id: organizationId,
    entity_id: entityId,
    party_id: partyId,
    method: normalizedMethod,
    provider,
    amount: normalizedAmount,
    currency: normalizedCurrency,
    metadata,
  });

  let payment = await PaymentTransactionRepository.create(transaction);

  if (!String(payment.payment_reference || "").trim()) {
    payment = await PaymentTransactionRepository.update(payment.id, {
      payment_reference: compactPaymentReference(payment.id),
    });
  }

  try {
    const action = await PaymentRailExecutionRuntime.executePaymentRail({
      payment,
      country,
      returnUrl,
    });

    const updated = await PaymentTransactionRepository.update(payment.id, {
      provider_reference: action.provider_reference || payment.provider_reference || null,
      metadata: {
        ...(payment.metadata || {}),
        rail_action: {
          type: action.type,
          provider: action.provider,
          status: action.status,
          provider_account_id: action.provider_account_id || null,
          provider_connection_id: action.provider_connection_id || null,
        },
      },
    });

    return {
      payment: updated,
      action,
    };
  } catch (error) {
    await PaymentTransactionRepository.update(payment.id, {
      status: "failed",
      metadata: {
        ...(payment.metadata || {}),
        rail_error: {
          code: error?.code || error?.message || "PAYMENT_RAIL_EXECUTION_FAILED",
          occurred_at: new Date().toISOString(),
        },
      },
    }).catch(() => {});

    throw error;
  }
}

export const PaymentExecutionRuntime = {
  createPayment,
};
