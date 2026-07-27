import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function finite(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${field} must be numeric`);
  }
  return normalized;
}

function dateOnly(value, field) {
  const normalized = text(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must be a valid date`);
  }
  return normalized;
}

function currency(value) {
  const normalized = text(value, "currency_code").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency_code must be a three-letter currency code");
  }
  return normalized;
}

function validateRange(startValue, endValue, startField, endField) {
  const start = dateOnly(startValue, startField);
  const end = dateOnly(endValue, endField);
  if (start > end) {
    throw new Error(`${startField} cannot be after ${endField}`);
  }
  return { start, end };
}

async function validateBankStatement({ payload, organizationId, entityId }) {
  const { start, end } = validateRange(
    payload.statement_start_date,
    payload.statement_end_date,
    "statement_start_date",
    "statement_end_date"
  );
  const statementCurrency = currency(payload.currency_code);
  const openingBalance = finite(payload.opening_balance, "opening_balance");
  const closingBalance = finite(payload.closing_balance, "closing_balance");
  const bankAccountId = text(payload.bank_account_id, "bank_account_id");

  const { data: account, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, currency, active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", bankAccountId)
    .maybeSingle();

  if (error) throw error;
  if (!account) {
    throw new Error("Bank account not found in selected legal entity");
  }
  if (account.active === false) {
    throw new Error("Archived bank account cannot receive a statement");
  }

  const accountCurrency = String(account.currency || "").trim().toUpperCase();
  if (accountCurrency && accountCurrency !== statementCurrency) {
    throw new Error(
      `Statement currency ${statementCurrency} does not match bank account currency ${accountCurrency}`
    );
  }

  return {
    ...payload,
    statement_start_date: start,
    statement_end_date: end,
    currency_code: statementCurrency,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    statement_number: text(payload.statement_number, "statement_number"),
  };
}

async function assertNoOverlappingPeriod({
  table,
  organizationId,
  entityId,
  start,
  end,
  filters,
  recordId,
  label,
}) {
  let query = supabaseAdmin
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .lte("period_start", end)
    .gte("period_end", start)
    .limit(1);

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  if (recordId) {
    query = query.neq("id", recordId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if ((data || []).length) {
    throw new Error(`${label} overlaps an existing period`);
  }
}

async function validateVatReturn({
  payload,
  organizationId,
  entityId,
  recordId,
}) {
  const registrationReference = text(
    payload.registration_reference,
    "registration_reference"
  );
  const jurisdictionCode = text(
    payload.jurisdiction_code,
    "jurisdiction_code"
  ).toUpperCase();
  const { start, end } = validateRange(
    payload.period_start,
    payload.period_end,
    "period_start",
    "period_end"
  );
  const filingDueDate = payload.filing_due_date
    ? dateOnly(payload.filing_due_date, "filing_due_date")
    : null;

  if (filingDueDate && filingDueDate < end) {
    throw new Error("filing_due_date cannot be before period_end");
  }

  await assertNoOverlappingPeriod({
    table: "finance_vat_returns",
    organizationId,
    entityId,
    start,
    end,
    filters: {
      registration_reference: registrationReference,
      jurisdiction_code: jurisdictionCode,
    },
    recordId,
    label: "VAT return",
  });

  return {
    ...payload,
    registration_reference: registrationReference,
    jurisdiction_code: jurisdictionCode,
    period_start: start,
    period_end: end,
    filing_due_date: filingDueDate,
    currency_code: currency(payload.currency_code),
  };
}

async function validateStatutoryFiling({
  payload,
  organizationId,
  entityId,
  recordId,
}) {
  const filingType = text(payload.filing_type, "filing_type").toUpperCase();
  const jurisdictionCode = text(
    payload.jurisdiction_code,
    "jurisdiction_code"
  ).toUpperCase();
  const { start, end } = validateRange(
    payload.period_start,
    payload.period_end,
    "period_start",
    "period_end"
  );
  const dueDate = dateOnly(payload.due_date, "due_date");

  if (dueDate < end) {
    throw new Error("due_date cannot be before period_end");
  }

  await assertNoOverlappingPeriod({
    table: "finance_statutory_filings",
    organizationId,
    entityId,
    start,
    end,
    filters: {
      filing_type: filingType,
      jurisdiction_code: jurisdictionCode,
    },
    recordId,
    label: "Statutory filing",
  });

  return {
    ...payload,
    filing_type: filingType,
    jurisdiction_code: jurisdictionCode,
    period_start: start,
    period_end: end,
    due_date: dueDate,
  };
}

export async function validateFinanceWorkspaceWrite({
  capabilityId,
  payload,
  organizationId,
  entityId,
  recordId = null,
}) {
  if (capabilityId === "bank_statements") {
    return validateBankStatement({ payload, organizationId, entityId });
  }

  if (capabilityId === "vat_returns") {
    return validateVatReturn({
      payload,
      organizationId,
      entityId,
      recordId,
    });
  }

  if (capabilityId === "statutory_filings") {
    return validateStatutoryFiling({
      payload,
      organizationId,
      entityId,
      recordId,
    });
  }

  return payload;
}
