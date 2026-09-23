import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { PaymentConfigurationRepository } from "../../repositories/PaymentConfigurationRepository";

function clean(value) {
  return String(value ?? "").trim();
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }
  return amount;
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
function toMinorUnits(currency, amount) {
  const value = positiveAmount(amount);
  return Math.round(value * (zeroDecimal(currency) ? 1 : 100));
}

function safeConfiguration(config) {
  const value = config?.configuration;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function paymentReference(payment) {
  return clean(payment?.payment_reference) || clean(payment?.id);
}

async function resolveStripeMerchantAccount({ payment, configuration }) {
  const connectionId = clean(configuration.provider_connection_id);
  if (!connectionId) {
    throw new Error("STRIPE_ORGANIZATION_MERCHANT_NOT_CONNECTED");
  }

  let query = supabaseAdmin
    .from("organization_payment_provider_accounts")
    .select("id,organization_id,entity_id,provider,provider_account_id,status,charges_enabled,payouts_enabled")
    .eq("id", connectionId)
    .eq("organization_id", payment.organization_id)
    .eq("provider", "stripe")
    .eq("purpose", "merchant_payments");

  if (payment.entity_id) {
    query = query.eq("entity_id", payment.entity_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.provider_account_id || !data.charges_enabled) {
    throw new Error("STRIPE_ORGANIZATION_MERCHANT_NOT_READY");
  }
  return data;
}

async function stripeCardAction({ payment, returnUrl, configuration }) {
  const merchant = await resolveStripeMerchantAccount({
    payment,
    configuration,
  });

  const metadata = {
    domain: "avantiqo_payment",
    paymentId: payment.id,
    organizationId: payment.organization_id,
    entityId: payment.entity_id || "",
    partyId: payment.party_id || "",
  };

  const session = await StripeProvider.createPaymentCheckout({
    organizationId: payment.organization_id,
    connectedAccountId: merchant.provider_account_id,
    idempotencyKey: `avantiqo-payment:${payment.id}`,
    session: {
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: upper(payment.currency).toLowerCase(),
          unit_amount: toMinorUnits(payment.currency, payment.amount),
          product_data: {
            name: clean(payment.metadata?.description) || "Avantiqo payment",
          },
        },
      }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${returnUrl}?paymentReturn=success&paymentId=${encodeURIComponent(payment.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?paymentReturn=cancelled&paymentId=${encodeURIComponent(payment.id)}`,
    },
  });

  return {
    type: "redirect",
    provider: "stripe",
    status: "requires_customer_action",
    url: session.url,
    provider_reference: session.id,
    provider_account_id: merchant.provider_account_id,
    provider_connection_id: merchant.id,
  };
}

async function resolveBankTransferAccount({ payment, configuration }) {
  const bankAccountId = clean(configuration.bank_account_id);

  if (bankAccountId) {
    let query = supabaseAdmin
      .from("bank_accounts")
      .select("id,organization_id,entity_id,bank_name,account_name,account_number,currency,currency_code,active")
      .eq("id", bankAccountId)
      .eq("organization_id", payment.organization_id)
      .eq("active", true);

    if (payment.entity_id) {
      query = query.eq("entity_id", payment.entity_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      throw new Error("BANK_TRANSFER_ACCOUNT_UNAVAILABLE");
    }

    return data;
  }

  return {
    bank_name: clean(configuration.bank_name),
    account_name: clean(configuration.account_name),
    account_number: clean(configuration.account_number),
    currency_code: upper(payment.currency),
    active: true,
  };
}

async function bankTransferAction({ payment, configuration }) {
  const account = await resolveBankTransferAccount({ payment, configuration });
  const bankName = clean(account.bank_name);
  const accountName = clean(account.account_name);
  const accountNumber = clean(account.account_number);
  const accountCurrency = upper(
    account.currency_code || account.currency || payment.currency,
  );

  if (!bankName || !accountName || !accountNumber) {
    throw new Error("BANK_TRANSFER_CONFIGURATION_INCOMPLETE");
  }

  if (accountCurrency !== upper(payment.currency)) {
    throw new Error("BANK_TRANSFER_CURRENCY_MISMATCH");
  }

  return {
    type: "bank_transfer",
    provider: "bank_transfer",
    status: "awaiting_external_settlement",
    reference: paymentReference(payment),
    amount: Number(payment.amount),
    currency: upper(payment.currency),
    bank_account_id: account.id || null,
    instructions: {
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      reference: paymentReference(payment),
    },
  };
}

async function promptPayAction({ payment, configuration }) {
  const promptPayId =
    clean(configuration.promptpay_id) ||
    clean(configuration.promptpay_identifier) ||
    clean(configuration.proxy_id);

  if (!promptPayId) {
    const error = new Error("PROMPTPAY_IDENTIFIER_NOT_CONFIGURED");
    error.code = "PROMPTPAY_IDENTIFIER_NOT_CONFIGURED";
    throw error;
  }

  return {
    type: "qr_payment",
    provider: "promptpay",
    status: "requires_qr_generation",
    amount: Number(payment.amount),
    currency: upper(payment.currency),
    reference: paymentReference(payment),
    promptpay_identifier: promptPayId,
  };
}

export async function executePaymentRail({
  payment,
  country = null,
  returnUrl,
}) {
  if (!payment?.id || !payment?.organization_id) {
    throw new Error("PAYMENT_TRANSACTION_REQUIRED");
  }

  const config = await PaymentConfigurationRepository.resolve({
    organizationId: payment.organization_id,
    paymentMethod: payment.payment_method,
    country,
    currency: payment.currency,
  });

  if (!config) {
    throw new Error("PAYMENT_METHOD_NOT_CONFIGURED");
  }

  const configuration = safeConfiguration(config);
  const method = clean(payment.payment_method).toLowerCase();
  const provider = clean(payment.provider).toLowerCase();

  if (method === "credit_card" && provider === "stripe") {
    return stripeCardAction({ payment, returnUrl, configuration });
  }

  if (method === "bank_transfer") {
    return bankTransferAction({ payment, configuration });
  }

  if (method === "qr_payment" && provider === "promptpay") {
    return promptPayAction({ payment, configuration });
  }

  throw new Error(`PAYMENT_PROVIDER_EXECUTION_UNAVAILABLE:${provider || method}`);
}

export const PaymentRailExecutionRuntime = {
  executePaymentRail,
};
