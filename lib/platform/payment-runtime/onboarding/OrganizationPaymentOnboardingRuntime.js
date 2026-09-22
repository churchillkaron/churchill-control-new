import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function countryCode(value) {
  const raw = clean(value);
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  const wanted = raw.toLowerCase();
  if (!wanted) return null;

  const aliases = new Map([
    ["thailand", "TH"],
    ["united states", "US"],
    ["united states of america", "US"],
    ["usa", "US"],
    ["united kingdom", "GB"],
    ["uk", "GB"],
  ]);
  if (aliases.has(wanted)) return aliases.get(wanted);

  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        if (clean(display.of(code)).toLowerCase() === wanted) return code;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function upsertPaymentConfig({
  organizationId,
  paymentMethod,
  country,
  currency,
  enabled,
  configuration,
}) {
  const existing = await supabaseAdmin
    .from("organization_payment_config")
    .select("id,configuration")
    .eq("organization_id", organizationId)
    .eq("payment_method", paymentMethod)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const payload = {
    country: country || null,
    currency: currency || null,
    enabled: Boolean(enabled),
    configuration: {
      ...(existing.data?.configuration || {}),
      ...(configuration || {}),
    },
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const updated = await supabaseAdmin
      .from("organization_payment_config")
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (updated.error) throw updated.error;
    return updated.data;
  }

  const inserted = await supabaseAdmin
    .from("organization_payment_config")
    .insert({
      organization_id: organizationId,
      payment_method: paymentMethod,
      ...payload,
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function ensureFinanceBankAccount({
  organizationId,
  entityId,
  bankName,
  accountName,
  accountNumber,
  currency,
}) {
  const normalizedAccountNumber = clean(accountNumber);
  if (!normalizedAccountNumber) return null;

  const existing = await supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("account_number", normalizedAccountNumber)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    const updated = await supabaseAdmin
      .from("bank_accounts")
      .update({
        bank_name: clean(bankName),
        account_name: clean(accountName),
        currency: upper(currency),
        currency_code: upper(currency),
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (updated.error) throw updated.error;
    return updated.data;
  }

  const inserted = await supabaseAdmin
    .from("bank_accounts")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      bank_name: clean(bankName),
      account_name: clean(accountName),
      account_number: normalizedAccountNumber,
      currency: upper(currency),
      currency_code: upper(currency),
      is_default: true,
      active: true,
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function ensureBankSettlementIntegration({
  organizationId,
  entityId,
  bankAccount,
  bankName,
  country,
}) {
  if (!bankAccount?.id) return null;

  const existing = await supabaseAdmin
    .from("finance_banking_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("bank_account_id", bankAccount.id)
    .eq("connection_type", "BANK_RECONCILIATION")
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data;

  const inserted = await supabaseAdmin
    .from("finance_banking_integrations")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      bank_name: clean(bankName),
      provider_code: "manual_bank_reconciliation",
      provider_name: clean(bankName) || "Bank",
      connection_mode: "MANUAL",
      connection_type: "BANK_RECONCILIATION",
      account_ids: [bankAccount.id],
      bank_account_id: bankAccount.id,
      capabilities: {
        payment_settlement: {
          enabled: true,
          incoming_directions: ["INFLOW"],
        },
      },
      managed_by: "AVANTIQO",
      status: "ACTIVE",
      health_status: "HEALTHY",
      last_checked_at: new Date().toISOString(),
      metadata: {
        purpose: "payment_settlement_verification",
        authority: "reconciled_bank_ledger_only",
      },
      provider_country_code: countryCode(country),
      sync_status: "MANUAL",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

function stripeConnectionStatus(account) {
  if (account?.charges_enabled && account?.payouts_enabled) return "ACTIVE";
  if (account?.details_submitted) return "REVIEW";
  return "PENDING";
}

async function saveStripeConnection({
  organizationId,
  entityId,
  account,
}) {
  const payload = {
    organization_id: organizationId,
    entity_id: entityId,
    provider: "stripe",
    purpose: "merchant_payments",
    provider_account_id: account.id,
    status: stripeConnectionStatus(account),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    requirements: account.requirements || {},
    metadata: {
      country: account.country || null,
      default_currency: account.default_currency || null,
    },
    updated_at: new Date().toISOString(),
  };

  const result = await supabaseAdmin
    .from("organization_payment_provider_accounts")
    .upsert(payload, {
      onConflict: "organization_id,entity_id,provider,purpose",
    })
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data;
}

export async function configureOrganizationPayments({
  organizationId,
  entity,
  ownerEmail,
  businessName,
  country,
  currency,
  paymentSetup = {},
  appOrigin,
}) {
  const result = {
    bankTransfer: null,
    promptPay: null,
    cardPayments: null,
  };

  const bank = paymentSetup?.bank || {};
  const needsSettlementBank =
    Boolean(paymentSetup?.enableBankTransfer) ||
    Boolean(paymentSetup?.enablePromptPay);

  let financeAccount = null;
  let bankingIntegration = null;

  if (needsSettlementBank) {
    if (
      !clean(bank.bankName) ||
      !clean(bank.accountName) ||
      !clean(bank.accountNumber)
    ) {
      throw new Error("BANK_PAYMENT_SETUP_INCOMPLETE");
    }

    financeAccount = await ensureFinanceBankAccount({
      organizationId,
      entityId: entity.id,
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumber: bank.accountNumber,
      currency: entity.currency || currency,
    });

    bankingIntegration = await ensureBankSettlementIntegration({
      organizationId,
      entityId: entity.id,
      bankAccount: financeAccount,
      bankName: bank.bankName,
      country,
    });
  }

  if (Boolean(paymentSetup?.enableBankTransfer) && financeAccount?.id) {
    result.bankTransfer = await upsertPaymentConfig({
      organizationId,
      paymentMethod: "bank_transfer",
      country: countryCode(country) || clean(country),
      currency: upper(entity.currency || currency),
      enabled: true,
      configuration: {
        provider: "bank_transfer",
        bank_account_id: financeAccount.id,
        banking_integration_id: bankingIntegration?.id || null,
      },
    });
  }

  const promptPayId = clean(paymentSetup?.promptPayId);
  if (
    Boolean(paymentSetup?.enablePromptPay) &&
    promptPayId &&
    financeAccount?.id
  ) {
    result.promptPay = await upsertPaymentConfig({
      organizationId,
      paymentMethod: "qr_payment",
      country: countryCode(country) || clean(country),
      currency: upper(entity.currency || currency),
      enabled: true,
      configuration: {
        provider: "promptpay",
        promptpay_identifier: promptPayId,
        bank_account_id: financeAccount.id,
        banking_integration_id: bankingIntegration?.id || null,
      },
    });
  }

  if (Boolean(paymentSetup?.enableCards)) {
    const normalizedCountry = countryCode(country);
    if (!normalizedCountry) {
      throw new Error("CARD_PAYMENT_COUNTRY_CODE_UNRESOLVED");
    }

    const existing = await supabaseAdmin
      .from("organization_payment_provider_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entity.id)
      .eq("provider", "stripe")
      .eq("purpose", "merchant_payments")
      .maybeSingle();

    if (existing.error) throw existing.error;

    let account;
    if (existing.data?.provider_account_id) {
      account = await StripeProvider.retrieveConnectedAccount({
        organizationId,
        connectedAccountId: existing.data.provider_account_id,
      });
    } else {
      account = await StripeProvider.createConnectedAccount({
        organizationId,
        country: normalizedCountry,
        email: ownerEmail,
        businessName,
        legalEntityId: entity.id,
      });
    }

    const connection = await saveStripeConnection({
      organizationId,
      entityId: entity.id,
      account,
    });

    let onboardingUrl = null;
    if (!account.details_submitted || !account.charges_enabled) {
      const origin = clean(appOrigin).replace(/\/$/, "");
      if (!origin) throw new Error("PAYMENT_ONBOARDING_APP_ORIGIN_REQUIRED");

      const link = await StripeProvider.createConnectedAccountOnboardingLink({
        organizationId,
        connectedAccountId: account.id,
        refreshUrl:
          `${origin}/api/payments/onboarding/stripe?organizationId=${encodeURIComponent(organizationId)}&refresh=1`,
        returnUrl:
          `${origin}/api/payments/onboarding/stripe?organizationId=${encodeURIComponent(organizationId)}&return=1`,
      });
      onboardingUrl = link.url;
    }

    result.cardPayments = {
      provider: "stripe",
      connection,
      onboardingUrl,
    };

    await upsertPaymentConfig({
      organizationId,
      paymentMethod: "credit_card",
      country: normalizedCountry,
      currency: upper(entity.currency || currency),
      enabled: Boolean(account.charges_enabled),
      configuration: {
        provider: "stripe",
        provider_connection_id: connection.id,
      },
    });
  }

  return result;
}

export const OrganizationPaymentOnboardingRuntime = {
  configure: configureOrganizationPayments,
};
