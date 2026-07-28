import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EXCHANGE_RATE_TYPES = new Set([
  "SPOT",
  "CLOSING",
  "AVERAGE",
  "HISTORICAL",
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

export async function validateFinanceWorkspaceWrite({
  capabilityId,
  organizationId,
  payload,
  recordId = null,
}) {
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
