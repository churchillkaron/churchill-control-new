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

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeCurrencyCode(value) {
  const cleaned = cleanText(value);
  return typeof cleaned === "string" ? cleaned.toUpperCase() : cleaned;
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

function validateExchangeRate(candidate) {
  const baseCurrency = normalizeCurrencyCode(candidate.base_currency);
  const quoteCurrency = normalizeCurrencyCode(candidate.quote_currency);
  const rateType = String(candidate.rate_type || "").toUpperCase();
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

export function normalizeFinanceWorkspacePayload(capabilityId, payload) {
  const normalized = { ...(payload || {}) };

  if (capabilityId === "banking_integrations") {
    normalized.connection_type = String(
      normalized.connection_type || ""
    )
      .trim()
      .toUpperCase();
    normalized.provider_name = "AVANTIQO_MANAGED";
    normalized.credential_reference = null;
    normalized.status = "PENDING_SETUP";
    return normalized;
  }

  if (capabilityId === "government_connections") {
    normalized.authority_name = String(
      normalized.authority_name || ""
    ).trim();
    normalized.connection_type = String(
      normalized.connection_type || ""
    )
      .trim()
      .toUpperCase();
    normalized.jurisdiction_code = String(
      normalized.jurisdiction_code || ""
    )
      .trim()
      .toUpperCase();
    normalized.credential_reference = null;
    normalized.status = "PENDING_SETUP";
    return normalized;
  }

  if (capabilityId !== "exchange_rates") {
    return normalized;
  }

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
    normalized.rate_type = String(normalized.rate_type || "").toUpperCase();
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
    throw new Error("Bank connections are managed by Avantiqo and cannot be edited directly");
  }

  if (!payload.bank_account_id) {
    throw new Error("Bank Account required");
  }

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

  if (!payload.authority_name) {
    throw new Error("Authority / Network required");
  }

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

    const configuredJurisdiction = String(
      profile?.country_code || ""
    )
      .trim()
      .toUpperCase();

    if (!configuredJurisdiction) {
      throw new Error(
        "Configure the Finance Organisation Profile before requesting a government connection"
      );
    }

    payload.jurisdiction_code = configuredJurisdiction;
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

export async function validateFinanceWorkspaceWrite({
  capabilityId,
  organizationId,
  payload,
  recordId = null,
}) {
  if (capabilityId === "banking_integrations") {
    await validateBankConnection({
      organizationId,
      payload,
      recordId,
    });
    return;
  }

  if (capabilityId === "government_connections") {
    await validateGovernmentConnection({
      organizationId,
      payload,
      recordId,
    });
    return;
  }

  if (capabilityId !== "exchange_rates") {
    return;
  }

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

    candidate = {
      ...existing,
      ...candidate,
    };
  }

  candidate = normalizeFinanceWorkspacePayload(capabilityId, candidate);
  validateExchangeRate(candidate);

  let duplicateQuery = supabaseAdmin
    .from("finance_exchange_rates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("base_currency", candidate.base_currency)
    .eq("quote_currency", candidate.quote_currency)
    .eq("effective_date", candidate.effective_date)
    .eq("rate_type", candidate.rate_type);

  if (recordId) {
    duplicateQuery = duplicateQuery.neq("id", recordId);
  }

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

export function decorateFinanceWorkspaceRows(capabilityId, rows) {
  if (capabilityId === "banking_integrations") {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const connectionLabel = String(row.connection_type || "Bank Connection")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());

      return {
        ...row,
        provider_name: "Avantiqo Managed",
        provider_display_name: "Avantiqo Managed",
        name: connectionLabel,
        title: connectionLabel,
        code: row.status || "PENDING_SETUP",
      };
    });
  }

  if (capabilityId === "government_connections") {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const connectionLabel = String(
        row.connection_type || "Government Connection"
      )
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());

      return {
        ...row,
        credential_reference: undefined,
        provider_display_name: "Avantiqo Managed",
        name: row.authority_name || "Government Authority",
        title: row.authority_name || "Government Authority",
        code: connectionLabel,
        connection_label: connectionLabel,
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
