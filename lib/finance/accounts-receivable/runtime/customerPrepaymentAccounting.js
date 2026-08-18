import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";
import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";

function text(value) {
  return String(value ?? "").trim();
}

function currency(value) {
  return text(value).toUpperCase();
}

function semanticConfigurationError(message) {
  const error = new Error(message);
  error.code = "CUSTOMER_PREPAYMENT_ACCOUNTING_CONFIGURATION_REQUIRED";
  return error;
}

function isSemanticConfigurationError(error) {
  return (
    text(error?.code) ===
    "CUSTOMER_PREPAYMENT_ACCOUNTING_CONFIGURATION_REQUIRED"
  );
}

function isMissingPostingRuleError(error, eventType) {
  return (
    text(error?.message) ===
    `No posting rule configured for ${text(eventType).toUpperCase()}`
  );
}

export async function loadPrepaymentBankContext({
  organizationId,
  entityId,
  bankAccountId,
  currencyCode,
}) {
  const bankResult = await supabaseAdmin
    .from("bank_accounts")
    .select("id,organization_id,entity_id,currency,currency_code,active,finance_account_id")
    .eq("id", bankAccountId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (bankResult.error) throw bankResult.error;
  if (!bankResult.data || bankResult.data.active === false) {
    throw semanticConfigurationError(
      "The selected settlement bank account is not active for this entity"
    );
  }

  const bankCurrency = currency(
    bankResult.data.currency_code || bankResult.data.currency
  );
  const transactionCurrency = currency(currencyCode);

  if (bankCurrency && transactionCurrency && bankCurrency !== transactionCurrency) {
    throw semanticConfigurationError(
      "The settlement bank account currency does not match the customer prepayment currency"
    );
  }

  if (!bankResult.data.finance_account_id) {
    throw semanticConfigurationError(
      "The selected settlement bank account is not linked to a Finance ledger account"
    );
  }

  const accountResult = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id,organization_id,entity_id,is_active")
    .eq("id", bankResult.data.finance_account_id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (accountResult.error) throw accountResult.error;
  if (!accountResult.data || accountResult.data.is_active === false) {
    throw semanticConfigurationError(
      "The settlement bank account Finance ledger mapping is not active for this entity"
    );
  }

  return {
    bank: bankResult.data,
    financeAccountId: accountResult.data.id,
  };
}

function replaceBankSide(lines, side, financeAccountId) {
  const normalizedSide = text(side).toUpperCase();
  if (!["DEBIT", "CREDIT"].includes(normalizedSide)) {
    return lines;
  }

  const key = normalizedSide === "DEBIT" ? "debit" : "credit";
  let replaced = false;

  const next = lines.map((line) => {
    if (replaced || Number(line?.[key] || 0) <= 0) return line;
    replaced = true;
    return {
      ...line,
      account_id: financeAccountId,
    };
  });

  if (!replaced) {
    throw new Error(`Customer prepayment journal has no ${normalizedSide.toLowerCase()} bank line`);
  }

  return next;
}

export async function prepareCustomerPrepaymentJournal({
  organizationId,
  entityId,
  partyId,
  eventType,
  sourceId,
  accountingDate,
  amount,
  currencyCode,
  exchangeRate,
  description,
  bankAccountId = null,
  bankSide = null,
}) {
  const journal = await prepareAccountingEventJournal({
    event: {
      id: `customer-prepayment:${eventType}:${sourceId}`,
      organization_id: organizationId,
      entity_id: entityId,
      event_type: eventType,
      source_module: "accounts_receivable",
      source_id: sourceId,
      occurred_at: `${accountingDate}T00:00:00.000Z`,
      payload: {
        party_id: partyId,
        source_document_id: sourceId,
        amount,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        entry_date: accountingDate,
        document_date: accountingDate,
        description,
      },
    },
  });

  if (!bankAccountId || !bankSide) return journal;

  const bankContext = await loadPrepaymentBankContext({
    organizationId,
    entityId,
    bankAccountId,
    currencyCode,
  });

  return {
    ...journal,
    lines: replaceBankSide(
      journal.lines,
      bankSide,
      bankContext.financeAccountId
    ),
    bank: bankContext.bank,
  };
}

export async function getCustomerPrepaymentAccountingReadiness({
  organizationId,
  entityId,
  bankAccountId,
  currencyCode,
  effectiveDate,
}) {
  const missing = [];

  try {
    await loadPrepaymentBankContext({
      organizationId,
      entityId,
      bankAccountId,
      currencyCode,
    });
  } catch (error) {
    if (!isSemanticConfigurationError(error)) throw error;
    missing.push({
      code: "BANK_LEDGER_MAPPING",
      message: error.message,
    });
  }

  const requiredRules = [
    "CUSTOMER_UNAPPLIED_CASH_RECEIVED",
    "CUSTOMER_UNAPPLIED_CASH_APPLIED",
    "CUSTOMER_UNAPPLIED_CASH_REFUNDED",
  ];

  for (const eventType of requiredRules) {
    try {
      await getPostingRule({
        organizationId,
        entityId,
        eventType,
        sourceModule: "accounts_receivable",
        postingDate: effectiveDate,
      });
    } catch (error) {
      if (!isMissingPostingRuleError(error, eventType)) throw error;
      missing.push({
        code: eventType,
        message: "A customer prepayment posting rule is not configured for this entity",
      });
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}
