import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  const normalized = cleanText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function sameAmount(left, right) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

function settlementPolicy(capabilities) {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return null;
  }

  const policy = capabilities.payment_settlement;
  return policy && typeof policy === "object" && !Array.isArray(policy)
    ? policy
    : null;
}

function allowedIncomingDirections(policy) {
  return Array.isArray(policy?.incoming_directions)
    ? policy.incoming_directions.map(upper).filter(Boolean)
    : [];
}

export const FinanceBankReconciliationVerifier = {
  key: "finance.bank_reconciliation",
  name: "Finance Bank Reconciliation",

  async verify({ payment, sourceReference }) {
    if (!payment?.id || !payment?.organization_id) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const ledgerId = cleanText(sourceReference);
    if (!ledgerId) {
      throw new Error("PAYMENT_SETTLEMENT_SOURCE_REFERENCE_REQUIRED");
    }

    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from("bank_ledger")
      .select(
        "id, organization_id, entity_id, bank_account_id, amount, direction, currency_code, reference_number, reconciled_statement_id, reconciled_at, source_document, source_document_id",
      )
      .eq("id", ledgerId)
      .maybeSingle();

    if (ledgerError) throw ledgerError;
    if (!ledger) throw new Error("PAYMENT_SETTLEMENT_BANK_LEDGER_NOT_FOUND");

    if (ledger.organization_id !== payment.organization_id) {
      throw new Error("PAYMENT_SETTLEMENT_ORGANIZATION_MISMATCH");
    }

    if (payment.entity_id && ledger.entity_id !== payment.entity_id) {
      throw new Error("PAYMENT_SETTLEMENT_ENTITY_MISMATCH");
    }

    if (!ledger.reconciled_statement_id || !ledger.reconciled_at) {
      throw new Error("PAYMENT_SETTLEMENT_RECONCILIATION_REQUIRED");
    }

    if (!sameAmount(ledger.amount, payment.amount)) {
      throw new Error("PAYMENT_SETTLEMENT_AMOUNT_MISMATCH");
    }

    const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, organization_id, entity_id, currency, currency_code, active")
      .eq("id", ledger.bank_account_id)
      .eq("organization_id", payment.organization_id)
      .maybeSingle();

    if (bankAccountError) throw bankAccountError;
    if (!bankAccount?.id || bankAccount.active === false) {
      throw new Error("PAYMENT_SETTLEMENT_BANK_ACCOUNT_UNAVAILABLE");
    }

    if (payment.entity_id && bankAccount.entity_id && bankAccount.entity_id !== payment.entity_id) {
      throw new Error("PAYMENT_SETTLEMENT_BANK_ACCOUNT_ENTITY_MISMATCH");
    }

    const evidenceCurrency = upper(
      ledger.currency_code || bankAccount.currency_code || bankAccount.currency,
    );
    if (!evidenceCurrency || evidenceCurrency !== upper(payment.currency)) {
      throw new Error("PAYMENT_SETTLEMENT_CURRENCY_MISMATCH");
    }

    const { data: integrations, error: integrationError } = await supabaseAdmin
      .from("finance_banking_integrations")
      .select(
        "id, organization_id, entity_id, bank_account_id, provider_code, provider_name, connection_mode, connection_type, capabilities, status, health_status",
      )
      .eq("organization_id", payment.organization_id)
      .eq("bank_account_id", bankAccount.id);

    if (integrationError) throw integrationError;

    const integration = (integrations || []).find((candidate) => {
      if (payment.entity_id && candidate.entity_id && candidate.entity_id !== payment.entity_id) {
        return false;
      }
      return upper(candidate.status) === "ACTIVE" && upper(candidate.health_status || "HEALTHY") !== "UNHEALTHY";
    });

    if (!integration) {
      throw new Error("PAYMENT_SETTLEMENT_BANK_INTEGRATION_REQUIRED");
    }

    const policy = settlementPolicy(integration.capabilities);
    if (!policy || policy.enabled !== true) {
      throw new Error("PAYMENT_SETTLEMENT_BANK_POLICY_REQUIRED");
    }

    const incomingDirections = allowedIncomingDirections(policy);
    if (!incomingDirections.length || !incomingDirections.includes(upper(ledger.direction))) {
      throw new Error("PAYMENT_SETTLEMENT_DIRECTION_NOT_ALLOWED");
    }

    const provider = cleanText(integration.provider_code || integration.provider_name);
    if (!provider) {
      throw new Error("PAYMENT_SETTLEMENT_PROVIDER_REQUIRED");
    }

    if (cleanText(payment.provider) !== provider) {
      throw new Error("PAYMENT_PROVIDER_MISMATCH");
    }

    const providerReference = cleanText(
      ledger.reference_number || ledger.reconciled_statement_id || ledger.id,
    );

    return {
      provider,
      provider_reference: providerReference,
      amount: Number(ledger.amount),
      currency: evidenceCurrency,
      settled_at: ledger.reconciled_at,
      verification_source: "finance.bank_reconciliation",
      metadata: {
        bank_ledger_id: ledger.id,
        bank_account_id: bankAccount.id,
        reconciliation_statement_id: ledger.reconciled_statement_id,
        banking_integration_id: integration.id,
        source_document: ledger.source_document || null,
        source_document_id: ledger.source_document_id || null,
      },
    };
  },
};
