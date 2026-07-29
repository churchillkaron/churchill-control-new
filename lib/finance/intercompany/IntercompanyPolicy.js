import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveActiveFinanceCurrency } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);
const INTERCOMPANY_TYPES = new Set([
  "FUNDING",
  "LOAN",
  "EXPENSE_RECHARGE",
  "SERVICE_CHARGE",
  "ASSET_TRANSFER",
  "CASH_TRANSFER",
  "DIVIDEND",
  "MANAGEMENT_FEE",
  "OTHER",
]);
const POSTING_SIDES = new Set(["DEBIT", "CREDIT"]);

function cleanText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function dateOnly(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) throw new Error("A valid date is required");
  return match[0];
}

function positiveNumber(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be positive`);
  }
  return number;
}

function normalizedIdempotencyKey(payload = {}) {
  return cleanText(payload.idempotency_key || payload.idempotencyKey);
}

function entityCurrency(entity = {}) {
  return upper(entity.currency || entity.base_currency);
}

function activeRecord(row = {}) {
  if (row.is_active === false || row.active === false || row.enabled === false) {
    return false;
  }
  return !["INACTIVE", "ARCHIVED", "DISABLED", "SUSPENDED"].includes(
    upper(row.status) || ""
  );
}

async function loadEntityPair({ organizationId, fromEntityId, toEntityId }) {
  if (!fromEntityId || !toEntityId) {
    throw new Error("Source and destination Legal Entities are required");
  }
  if (String(fromEntityId) === String(toEntityId)) {
    throw new Error("Source and destination Legal Entities must be different");
  }

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", [fromEntityId, toEntityId]);

  if (error) throw error;

  const byId = new Map((data || []).map((row) => [String(row.id), row]));
  const fromEntity = byId.get(String(fromEntityId));
  const toEntity = byId.get(String(toEntityId));

  if (!fromEntity || !toEntity) {
    throw new Error("Both Legal Entities must belong to this organisation");
  }
  if (!activeRecord(fromEntity) || !activeRecord(toEntity)) {
    throw new Error("Both Legal Entities must be active");
  }
  if (!entityCurrency(fromEntity) || !entityCurrency(toEntity)) {
    throw new Error("Both Legal Entities require a functional currency");
  }

  return { fromEntity, toEntity };
}

async function resolveConfiguredRate({
  organizationId,
  baseCurrency,
  quoteCurrency,
  effectiveDate,
  suppliedRate,
  label,
}) {
  if (baseCurrency === quoteCurrency) {
    if (suppliedRate !== undefined && suppliedRate !== null && suppliedRate !== "") {
      const provided = positiveNumber(suppliedRate, label);
      if (Math.abs(provided - 1) > 0.0000001) {
        throw new Error(`${label} must be 1 when transaction and functional currencies match`);
      }
    }
    return 1;
  }

  if (suppliedRate !== undefined && suppliedRate !== null && suppliedRate !== "") {
    return positiveNumber(suppliedRate, label);
  }

  const { data, error } = await supabaseAdmin
    .from("finance_exchange_rates")
    .select("*")
    .eq("organization_id", organizationId)
    .lte("effective_date", effectiveDate)
    .order("effective_date", { ascending: false })
    .limit(250);

  if (error) {
    if (MISSING_RELATION_CODES.has(String(error.code || ""))) {
      throw new Error(`${label} is required because no configured exchange-rate table is available`);
    }
    throw error;
  }

  const activeRates = (data || []).filter(activeRecord);
  const direct = activeRates.find(
    (row) =>
      upper(row.base_currency) === baseCurrency &&
      upper(row.quote_currency) === quoteCurrency &&
      Number(row.rate) > 0
  );
  if (direct) return Number(direct.rate);

  const inverse = activeRates.find(
    (row) =>
      upper(row.base_currency) === quoteCurrency &&
      upper(row.quote_currency) === baseCurrency &&
      Number(row.rate) > 0
  );
  if (inverse) return 1 / Number(inverse.rate);

  throw new Error(`${label} is required because no effective configured exchange rate was found`);
}

async function assertAccounts({ organizationId, accountRequirements }) {
  const ids = [...new Set(accountRequirements.map((item) => item.accountId).filter(Boolean))];
  if (ids.length !== accountRequirements.length) {
    throw new Error("Every intercompany posting account is required and must be distinct within its entity journal");
  }

  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) throw error;

  const byId = new Map((data || []).map((row) => [String(row.id), row]));
  for (const requirement of accountRequirements) {
    const account = byId.get(String(requirement.accountId));
    if (!account) throw new Error(`${requirement.label} was not found in this organisation`);
    if (String(account.entity_id || "") !== String(requirement.entityId)) {
      throw new Error(`${requirement.label} belongs to the wrong Legal Entity`);
    }
    if (!activeRecord(account)) throw new Error(`${requirement.label} must be active`);
  }
}

async function loadTransaction({ organizationId, transactionId }) {
  if (!transactionId) throw new Error("transaction_id required");
  const { data, error } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", transactionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Intercompany transaction not found");
  return data;
}

export function normalizeIntercompanyCreatePayload(payload = {}) {
  return {
    fromEntityId: cleanText(
      payload.from_legal_entity_id || payload.source_entity_id || payload.fromEntityId
    ),
    toEntityId: cleanText(
      payload.to_legal_entity_id || payload.target_entity_id || payload.toEntityId
    ),
    transactionType: upper(payload.transaction_type),
    referenceNumber: cleanText(payload.reference_number),
    transactionDate: dateOnly(payload.transaction_date || payload.posting_date),
    postingDate: dateOnly(payload.posting_date || payload.transaction_date),
    dueDate: dateOnly(payload.due_date),
    description: cleanText(payload.description),
    transactionCurrency: upper(payload.transaction_currency || payload.currency_code || payload.currency),
    amount: positiveNumber(payload.amount, "Amount"),
    fromExchangeRate: payload.from_exchange_rate,
    toExchangeRate: payload.to_exchange_rate,
    fromIntercompanyAccountId: cleanText(payload.from_intercompany_account_id),
    fromOffsetAccountId: cleanText(payload.from_offset_account_id),
    fromIntercompanySide: upper(payload.from_intercompany_side),
    toIntercompanyAccountId: cleanText(payload.to_intercompany_account_id),
    toOffsetAccountId: cleanText(payload.to_offset_account_id),
    toIntercompanySide: upper(payload.to_intercompany_side),
    idempotencyKey: normalizedIdempotencyKey(payload),
  };
}

export async function createIntercompanyTransactionAtomic({
  organizationId,
  payload,
  actorId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  const input = normalizeIntercompanyCreatePayload(payload);

  if (!INTERCOMPANY_TYPES.has(input.transactionType)) {
    throw new Error("Select a supported intercompany transaction type");
  }
  if (!input.referenceNumber) throw new Error("Reference Number required");
  if (!input.transactionDate || !input.postingDate) {
    throw new Error("Transaction Date and Posting Date are required");
  }
  if (input.dueDate && input.dueDate < input.transactionDate) {
    throw new Error("Due Date cannot be before Transaction Date");
  }
  if (!input.description) throw new Error("Description required");
  if (!input.transactionCurrency) throw new Error("Transaction Currency required");
  if (!POSTING_SIDES.has(input.fromIntercompanySide)) {
    throw new Error("Select the source intercompany account posting side");
  }
  if (!POSTING_SIDES.has(input.toIntercompanySide)) {
    throw new Error("Select the destination intercompany account posting side");
  }
  if (!input.idempotencyKey) throw new Error("idempotency_key required");

  const { fromEntity, toEntity } = await loadEntityPair({
    organizationId,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
  });

  const configuredCurrency = await resolveActiveFinanceCurrency({
    organizationId,
    code: input.transactionCurrency,
  });
  if (!configuredCurrency) {
    throw new Error("Transaction Currency must be active for this organisation");
  }

  const fromCurrency = entityCurrency(fromEntity);
  const toCurrency = entityCurrency(toEntity);
  const fromExchangeRate = await resolveConfiguredRate({
    organizationId,
    baseCurrency: input.transactionCurrency,
    quoteCurrency: fromCurrency,
    effectiveDate: input.postingDate,
    suppliedRate: input.fromExchangeRate,
    label: "Source Entity Exchange Rate",
  });
  const toExchangeRate = await resolveConfiguredRate({
    organizationId,
    baseCurrency: input.transactionCurrency,
    quoteCurrency: toCurrency,
    effectiveDate: input.postingDate,
    suppliedRate: input.toExchangeRate,
    label: "Destination Entity Exchange Rate",
  });

  await assertAccounts({
    organizationId,
    accountRequirements: [
      { accountId: input.fromIntercompanyAccountId, entityId: input.fromEntityId, label: "Source Intercompany Account" },
      { accountId: input.fromOffsetAccountId, entityId: input.fromEntityId, label: "Source Offset Account" },
      { accountId: input.toIntercompanyAccountId, entityId: input.toEntityId, label: "Destination Intercompany Account" },
      { accountId: input.toOffsetAccountId, entityId: input.toEntityId, label: "Destination Offset Account" },
    ],
  });

  const transactionId = globalThis.crypto?.randomUUID?.();
  if (!transactionId) throw new Error("Unable to allocate intercompany transaction ID");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_create_intercompany_atomic",
    {
      p_transaction_id: transactionId,
      p_organization_id: organizationId,
      p_from_entity_id: input.fromEntityId,
      p_to_entity_id: input.toEntityId,
      p_transaction_type: input.transactionType,
      p_reference_number: input.referenceNumber,
      p_transaction_date: input.transactionDate,
      p_posting_date: input.postingDate,
      p_due_date: input.dueDate,
      p_description: input.description,
      p_transaction_currency: input.transactionCurrency,
      p_amount: input.amount,
      p_from_currency: fromCurrency,
      p_to_currency: toCurrency,
      p_from_exchange_rate: fromExchangeRate,
      p_to_exchange_rate: toExchangeRate,
      p_from_intercompany_account_id: input.fromIntercompanyAccountId,
      p_from_offset_account_id: input.fromOffsetAccountId,
      p_from_intercompany_side: input.fromIntercompanySide,
      p_to_intercompany_account_id: input.toIntercompanyAccountId,
      p_to_offset_account_id: input.toOffsetAccountId,
      p_to_intercompany_side: input.toIntercompanySide,
      p_created_by: cleanText(actorId),
      p_idempotency_key: input.idempotencyKey,
    }
  );

  if (error) throw new Error(`Intercompany posting failed: ${error.message}`);
  return data;
}

export async function reconcileIntercompanyTransactionAtomic({
  organizationId,
  payload,
  actorId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  const transactionId = cleanText(payload.transaction_id || payload.transactionId || payload.id);
  const reconciliationDate = dateOnly(payload.reconciliation_date) || new Date().toISOString().slice(0, 10);
  const idempotencyKey = normalizedIdempotencyKey(payload);
  if (!idempotencyKey) throw new Error("idempotency_key required");

  await loadTransaction({ organizationId, transactionId });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_reconcile_intercompany_atomic",
    {
      p_organization_id: organizationId,
      p_transaction_id: transactionId,
      p_reconciliation_date: reconciliationDate,
      p_notes: cleanText(payload.notes),
      p_created_by: cleanText(actorId),
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) throw new Error(`Intercompany reconciliation failed: ${error.message}`);
  return data;
}

export async function settleIntercompanyTransactionAtomic({
  organizationId,
  payload,
  actorId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  const transactionId = cleanText(payload.transaction_id || payload.transactionId || payload.id);
  const transaction = await loadTransaction({ organizationId, transactionId });

  if (upper(transaction.reconciliation_status) !== "MATCHED") {
    throw new Error("Intercompany transaction must be reconciled before settlement");
  }
  if (["SETTLED", "VOIDED"].includes(upper(transaction.status))) {
    throw new Error(`Intercompany transaction is already ${upper(transaction.status).toLowerCase()}`);
  }

  const settlementDate = dateOnly(payload.settlement_date);
  if (!settlementDate) throw new Error("Settlement Date required");
  const settlementAmount = positiveNumber(payload.settlement_amount || payload.amount, "Settlement Amount");
  const outstanding = Number(transaction.outstanding_amount ?? transaction.amount ?? 0);
  if (settlementAmount - outstanding > 0.000001) {
    throw new Error("Settlement Amount exceeds the outstanding intercompany balance");
  }

  const { fromEntity, toEntity } = await loadEntityPair({
    organizationId,
    fromEntityId: transaction.from_legal_entity_id,
    toEntityId: transaction.to_legal_entity_id,
  });
  const transactionCurrency = upper(transaction.transaction_currency || transaction.currency_code || transaction.currency);
  const fromCurrency = upper(transaction.from_entity_currency) || entityCurrency(fromEntity);
  const toCurrency = upper(transaction.to_entity_currency) || entityCurrency(toEntity);
  const fromExchangeRate = await resolveConfiguredRate({
    organizationId,
    baseCurrency: transactionCurrency,
    quoteCurrency: fromCurrency,
    effectiveDate: settlementDate,
    suppliedRate: payload.from_exchange_rate,
    label: "Source Settlement Exchange Rate",
  });
  const toExchangeRate = await resolveConfiguredRate({
    organizationId,
    baseCurrency: transactionCurrency,
    quoteCurrency: toCurrency,
    effectiveDate: settlementDate,
    suppliedRate: payload.to_exchange_rate,
    label: "Destination Settlement Exchange Rate",
  });

  const fromSettlementAccountId = cleanText(payload.from_settlement_account_id || payload.from_bank_account_id);
  const toSettlementAccountId = cleanText(payload.to_settlement_account_id || payload.to_bank_account_id);
  await assertAccounts({
    organizationId,
    accountRequirements: [
      { accountId: fromSettlementAccountId, entityId: transaction.from_legal_entity_id, label: "Source Settlement Account" },
      { accountId: toSettlementAccountId, entityId: transaction.to_legal_entity_id, label: "Destination Settlement Account" },
    ],
  });

  const idempotencyKey = normalizedIdempotencyKey(payload);
  if (!idempotencyKey) throw new Error("idempotency_key required");

  const settlementId = globalThis.crypto?.randomUUID?.();
  if (!settlementId) throw new Error("Unable to allocate intercompany settlement ID");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_settle_intercompany_atomic",
    {
      p_settlement_id: settlementId,
      p_organization_id: organizationId,
      p_transaction_id: transactionId,
      p_settlement_date: settlementDate,
      p_settlement_amount: settlementAmount,
      p_from_settlement_account_id: fromSettlementAccountId,
      p_to_settlement_account_id: toSettlementAccountId,
      p_from_exchange_rate: fromExchangeRate,
      p_to_exchange_rate: toExchangeRate,
      p_reference_number: cleanText(payload.reference_number),
      p_notes: cleanText(payload.notes),
      p_created_by: cleanText(actorId),
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) throw new Error(`Intercompany settlement failed: ${error.message}`);
  return data;
}

export const INTERCOMPANY_TRANSACTION_TYPES = Object.freeze(
  [...INTERCOMPANY_TYPES]
);
