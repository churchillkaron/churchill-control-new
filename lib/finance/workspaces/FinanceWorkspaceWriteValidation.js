import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EXCHANGE_RATE_TYPES = new Set([
  "SPOT",
  "CLOSING",
  "AVERAGE",
  "HISTORICAL",
]);

const BANK_CONNECTION_TYPES = new Set([
  "TRANSACTION_FEED",
  "STATEMENT_IMPORT",
  "BALANCE_SYNC",
]);

const GOVERNMENT_CONNECTION_TYPES = new Set([
  "TAX_FILING",
  "E_INVOICING",
  "STATUTORY_REPORTING",
  "PAYROLL_REPORTING",
  "CUSTOMS_REPORTING",
  "OTHER",
]);

const POSTING_EVENT_TYPES = new Set([
  "CUSTOMER_INVOICE",
  "CUSTOMER_CREDIT_NOTE",
  "CUSTOMER_PAYMENT",
  "VENDOR_BILL",
  "VENDOR_CREDIT_NOTE",
  "VENDOR_PAYMENT",
  "BANK_RECEIPT",
  "BANK_PAYMENT",
  "MANUAL_JOURNAL",
  "DEPRECIATION",
  "FX_REVALUATION",
  "INVENTORY_RECEIPT",
  "INVENTORY_ISSUE",
  "PAYROLL_POSTING",
  "TAX_POSTING",
  "INTERCOMPANY",
  "PERIOD_CLOSE",
  "YEAR_END_CLOSE",
]);

const POSTING_SOURCE_MODULES = new Set([
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "BANKING",
  "GENERAL_LEDGER",
  "FIXED_ASSETS",
  "INVENTORY",
  "PAYROLL",
  "TAX",
  "INTERCOMPANY",
  "PERIOD_CLOSE",
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeKey(value) {
  const cleaned = cleanText(value);
  return typeof cleaned === "string" ? cleaned.toUpperCase() : cleaned;
}

function normalizeCurrencyCode(value) {
  return normalizeKey(value);
}

function normalizeDate(value) {
  const cleaned = cleanText(value);
  return typeof cleaned === "string" ? cleaned.slice(0, 10) : cleaned;
}

function validateDate(value, field) {
  if (!value) return;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
}

function dateRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const maximumDate = "9999-12-31";
  return (
    leftStart <= (rightEnd || maximumDate) &&
    rightStart <= (leftEnd || maximumDate)
  );
}

function validateExchangeRate(candidate) {
  const baseCurrency = normalizeCurrencyCode(candidate.base_currency);
  const quoteCurrency = normalizeCurrencyCode(candidate.quote_currency);
  const rateType = normalizeKey(candidate.rate_type);
  const rate = Number(candidate.rate);

  if (baseCurrency && quoteCurrency && baseCurrency === quoteCurrency) {
    throw new Error("Base Currency and Quote Currency must be different");
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Exchange Rate must be greater than zero");
  }
  if (!EXCHANGE_RATE_TYPES.has(rateType)) {
    throw new Error("Rate Type is not supported");
  }

  validateDate(candidate.effective_date, "Effective Date");

  if (!String(candidate.source || "").trim()) {
    throw new Error("Rate Source required");
  }
}

function normalizePostingRule(payload) {
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    payload.name = String(payload.name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "event_type")) {
    payload.event_type = normalizeKey(payload.event_type);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "source_module")) {
    payload.source_module = normalizeKey(payload.source_module);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "effective_from")) {
    payload.effective_from = normalizeDate(payload.effective_from);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "effective_to")) {
    payload.effective_to = payload.effective_to
      ? normalizeDate(payload.effective_to)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
    payload.priority = Number(payload.priority);
  }

  return payload;
}

export function normalizeFinanceWorkspacePayload(capabilityId, payload) {
  const normalized = { ...(payload || {}) };

  if (capabilityId === "posting_rules") {
    return normalizePostingRule(normalized);
  }

  if (capabilityId === "banking_integrations") {
    normalized.connection_type = normalizeKey(normalized.connection_type);
    normalized.provider_name = "AVANTIQO_MANAGED";
    normalized.credential_reference = null;
    normalized.status = "PENDING_SETUP";
    return normalized;
  }

  if (capabilityId === "government_connections") {
    normalized.authority_name = String(normalized.authority_name || "").trim();
    normalized.connection_type = normalizeKey(normalized.connection_type);
    normalized.jurisdiction_code = normalizeKey(normalized.jurisdiction_code);
    normalized.credential_reference = null;
    normalized.status = "PENDING_SETUP";
    return normalized;
  }

  if (capabilityId !== "exchange_rates") return normalized;

  if (Object.prototype.hasOwnProperty.call(normalized, "base_currency")) {
    normalized.base_currency = normalizeCurrencyCode(normalized.base_currency);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "quote_currency")) {
    normalized.quote_currency = normalizeCurrencyCode(normalized.quote_currency);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "effective_date")) {
    normalized.effective_date = normalizeDate(normalized.effective_date);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "rate_type")) {
    normalized.rate_type = normalizeKey(normalized.rate_type);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "source")) {
    normalized.source = String(normalized.source || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "rate")) {
    normalized.rate = Number(normalized.rate);
  }

  return normalized;
}

async function validateBankConnection({ organizationId, payload, recordId }) {
  if (recordId) {
    throw new Error(
      "Bank connections are managed by Avantiqo and cannot be edited directly"
    );
  }
  if (!payload.bank_account_id) throw new Error("Bank Account required");
  if (!BANK_CONNECTION_TYPES.has(payload.connection_type)) {
    throw new Error("Connection Type is not supported");
  }

  const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, active, status")
    .eq("organization_id", organizationId)
    .eq("id", payload.bank_account_id)
    .maybeSingle();

  if (bankAccountError) throw bankAccountError;
  if (!bankAccount) throw new Error("Bank Account not found in this organisation");
  if (
    bankAccount.active === false ||
    ["ARCHIVED", "INACTIVE"].includes(
      String(bankAccount.status || "").toUpperCase()
    )
  ) {
    throw new Error("Bank Account is not active");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("finance_banking_integrations")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("bank_account_id", payload.bank_account_id)
    .eq("connection_type", payload.connection_type);

  if (existingError) throw existingError;
  if (
    (existing || []).some(
      (row) => String(row.status || "").toUpperCase() !== "ARCHIVED"
    )
  ) {
    throw new Error("This bank connection request already exists");
  }
}

async function validateGovernmentConnection({
  organizationId,
  payload,
  recordId,
}) {
  if (recordId) {
    throw new Error(
      "Government connections are managed by Avantiqo and cannot be edited directly"
    );
  }
  if (!payload.authority_name) throw new Error("Authority / Network required");
  if (!GOVERNMENT_CONNECTION_TYPES.has(payload.connection_type)) {
    throw new Error("Connection Type is not supported");
  }

  if (!payload.jurisdiction_code) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("finance_organization_profiles")
      .select("country_code")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (profileError) throw profileError;

    const jurisdiction = normalizeKey(profile?.country_code);
    if (!jurisdiction) {
      throw new Error(
        "Configure the Finance Organisation Profile before requesting a government connection"
      );
    }
    payload.jurisdiction_code = jurisdiction;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("finance_government_connections")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("authority_name", payload.authority_name)
    .eq("jurisdiction_code", payload.jurisdiction_code)
    .eq("connection_type", payload.connection_type);

  if (existingError) throw existingError;
  if (
    (existing || []).some(
      (row) => String(row.status || "").toUpperCase() !== "ARCHIVED"
    )
  ) {
    throw new Error("This government connection request already exists");
  }
}

async function validatePostingRule({ organizationId, payload, recordId }) {
  let candidate = { ...(payload || {}) };

  if (recordId) {
    const { data: existing, error } = await supabaseAdmin
      .from("finance_posting_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", recordId)
      .maybeSingle();

    if (error) throw error;
    if (!existing) throw new Error("Posting Rule not found");
    candidate = { ...existing, ...candidate };
  }

  candidate = normalizePostingRule(candidate);
  Object.assign(payload, normalizePostingRule(payload));

  if (!candidate.entity_id) throw new Error("Legal Entity required");
  if (!candidate.name) throw new Error("Rule Name required");
  if (!POSTING_EVENT_TYPES.has(candidate.event_type)) {
    throw new Error("Accounting Event is not supported");
  }
  if (!POSTING_SOURCE_MODULES.has(candidate.source_module)) {
    throw new Error("Source Domain is not supported");
  }
  if (!candidate.debit_account_id || !candidate.credit_account_id) {
    throw new Error("Debit Account and Credit Account required");
  }
  if (candidate.debit_account_id === candidate.credit_account_id) {
    throw new Error("Debit Account and Credit Account must be different");
  }

  validateDate(candidate.effective_from, "Effective From");
  validateDate(candidate.effective_to, "Effective To");
  if (
    candidate.effective_to &&
    candidate.effective_to < candidate.effective_from
  ) {
    throw new Error("Effective To cannot be before Effective From");
  }

  const priority = Number(candidate.priority);
  if (!Number.isInteger(priority) || priority < 1) {
    throw new Error("Priority must be a whole number greater than zero");
  }

  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id, organization_id, entity_id, is_active, active, status")
    .eq("organization_id", organizationId)
    .eq("entity_id", candidate.entity_id)
    .in("id", [candidate.debit_account_id, candidate.credit_account_id]);

  if (accountError) throw accountError;
  if ((accounts || []).length !== 2) {
    throw new Error(
      "Debit and Credit Accounts must belong to the selected Legal Entity"
    );
  }

  const inactiveAccount = (accounts || []).find(
    (account) =>
      account.is_active === false ||
      account.active === false ||
      ["INACTIVE", "ARCHIVED", "CLOSED"].includes(
        String(account.status || "").toUpperCase()
      )
  );
  if (inactiveAccount) throw new Error("Posting accounts must be active");

  let conflictQuery = supabaseAdmin
    .from("finance_posting_rules")
    .select("id, effective_from, effective_to, status")
    .eq("organization_id", organizationId)
    .eq("entity_id", candidate.entity_id)
    .eq("event_type", candidate.event_type)
    .eq("source_module", candidate.source_module)
    .eq("priority", priority)
    .eq("status", "ACTIVE");

  if (recordId) conflictQuery = conflictQuery.neq("id", recordId);

  const { data: possibleConflicts, error: conflictError } = await conflictQuery;
  if (conflictError) throw conflictError;

  const overlap = (possibleConflicts || []).find((row) =>
    dateRangesOverlap(
      candidate.effective_from,
      candidate.effective_to,
      row.effective_from,
      row.effective_to
    )
  );

  if (overlap) {
    throw new Error(
      "An active Posting Rule with the same entity, event, source, priority and overlapping dates already exists"
    );
  }
}

async function validateExchangeRateWrite({ organizationId, payload, recordId }) {
  let candidate = { ...(payload || {}) };

  if (recordId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_exchange_rates")
      .select("id, base_currency, quote_currency, effective_date, rate, source, rate_type")
      .eq("organization_id", organizationId)
      .eq("id", recordId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new Error("Exchange Rate not found");
    candidate = { ...existing, ...candidate };
  }

  candidate = normalizeFinanceWorkspacePayload("exchange_rates", candidate);
  validateExchangeRate(candidate);

  let duplicateQuery = supabaseAdmin
    .from("finance_exchange_rates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("base_currency", candidate.base_currency)
    .eq("quote_currency", candidate.quote_currency)
    .eq("effective_date", candidate.effective_date)
    .eq("rate_type", candidate.rate_type);

  if (recordId) duplicateQuery = duplicateQuery.neq("id", recordId);

  const { data: duplicate, error: duplicateError } = await duplicateQuery
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw duplicateError;
  if (duplicate) {
    throw new Error(
      "An Exchange Rate already exists for this currency pair, date and rate type"
    );
  }
}

export async function validateFinanceWorkspaceWrite({
  capabilityId,
  organizationId,
  payload,
  recordId = null,
}) {
  if (capabilityId === "posting_rules") {
    await validatePostingRule({ organizationId, payload, recordId });
    return;
  }
  if (capabilityId === "banking_integrations") {
    await validateBankConnection({ organizationId, payload, recordId });
    return;
  }
  if (capabilityId === "government_connections") {
    await validateGovernmentConnection({ organizationId, payload, recordId });
    return;
  }
  if (capabilityId === "exchange_rates") {
    await validateExchangeRateWrite({ organizationId, payload, recordId });
  }
}

export function decorateFinanceWorkspaceRows(capabilityId, rows) {
  if (capabilityId === "posting_rules") {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      name: row.name || "Posting Rule",
      title: row.name || "Posting Rule",
      code: [row.event_type, row.source_module].filter(Boolean).join(" · "),
    }));
  }

  if (capabilityId === "banking_integrations") {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const label = String(row.connection_type || "Bank Connection")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
      return {
        ...row,
        provider_name: "Avantiqo Managed",
        provider_display_name: "Avantiqo Managed",
        name: label,
        title: label,
        code: row.status || "PENDING_SETUP",
      };
    });
  }

  if (capabilityId === "government_connections") {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const label = String(row.connection_type || "Government Connection")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
      return {
        ...row,
        credential_reference: undefined,
        provider_display_name: "Avantiqo Managed",
        name: row.authority_name || "Government Authority",
        title: row.authority_name || "Government Authority",
        code: label,
        connection_label: label,
      };
    });
  }

  if (capabilityId !== "exchange_rates") {
    return Array.isArray(rows) ? rows : [];
  }

  return [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => {
      const dateOrder = String(right.effective_date || "").localeCompare(
        String(left.effective_date || "")
      );
      if (dateOrder !== 0) return dateOrder;
      return `${left.base_currency || ""}/${left.quote_currency || ""}`.localeCompare(
        `${right.base_currency || ""}/${right.quote_currency || ""}`
      );
    })
    .map((row) => {
      const pair = [row.base_currency, row.quote_currency]
        .filter(Boolean)
        .join(" / ");
      return {
        ...row,
        name: pair || "Exchange Rate",
        code: pair || null,
        title: pair || "Exchange Rate",
        rate_display: Number.isFinite(Number(row.rate))
          ? Number(row.rate).toLocaleString("en-GB", {
              maximumFractionDigits: 10,
            })
          : row.rate,
      };
    });
}
