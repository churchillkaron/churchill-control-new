import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MISSING_RELATION_CODES = new Set([
  "42P01",
  "PGRST204",
  "PGRST205",
]);

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
  const candidate = new Date(normalized);
  if (Number.isNaN(candidate.getTime())) {
    throw new Error("Finance exchange-rate effective date must be valid");
  }
  return candidate.toISOString().slice(0, 10);
}

function activeRecord(row = {}) {
  if (row.is_active === false || row.active === false || row.enabled === false) {
    return false;
  }
  return !["INACTIVE", "ARCHIVED", "DISABLED", "SUSPENDED"].includes(
    upper(row.status) || "",
  );
}

async function resolveEntityCurrency({ organizationId, entityId }) {
  if (!organizationId || !entityId) {
    throw new Error("Finance exchange-rate organization and entity are required");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("base_currency,functional_currency,reporting_currency,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (profileError && !MISSING_RELATION_CODES.has(String(profileError.code || ""))) {
    throw profileError;
  }

  const profileCurrency = upper(
    profile?.functional_currency ||
      profile?.base_currency ||
      profile?.reporting_currency,
  );
  if (profileCurrency && activeRecord(profile || {})) return profileCurrency;

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("currency,is_active")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity || entity.is_active === false) {
    throw new Error("Finance exchange-rate legal entity is unavailable");
  }

  const entityCurrency = upper(entity.currency);
  if (!entityCurrency) {
    throw new Error("Finance accounting entity currency is not configured");
  }
  return entityCurrency;
}

export async function resolveFinanceExchangeRate({
  organizationId,
  entityId,
  transactionCurrency,
  effectiveDate,
} = {}) {
  const currency = upper(transactionCurrency);
  const postingDate = dateOnly(effectiveDate);
  if (!currency) throw new Error("Transaction currency required");
  if (!postingDate) throw new Error("Finance exchange-rate effective date required");

  const functionalCurrency = await resolveEntityCurrency({
    organizationId,
    entityId,
  });

  if (currency === functionalCurrency) {
    return {
      transaction_currency: currency,
      functional_currency: functionalCurrency,
      exchange_rate: 1,
      effective_date: postingDate,
      source: "SAME_CURRENCY",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("finance_exchange_rates")
    .select("*")
    .eq("organization_id", organizationId)
    .lte("effective_date", postingDate)
    .order("effective_date", { ascending: false })
    .limit(250);

  if (error) {
    if (MISSING_RELATION_CODES.has(String(error.code || ""))) {
      throw new Error(
        `No Finance exchange-rate table is available for ${currency}/${functionalCurrency}`,
      );
    }
    throw error;
  }

  const activeRates = (data || []).filter((row) => {
    if (!activeRecord(row)) return false;
    if (row.entity_id && String(row.entity_id) !== String(entityId)) return false;
    return true;
  });

  const direct = activeRates.find(
    (row) =>
      upper(row.base_currency || row.from_currency) === currency &&
      upper(row.quote_currency || row.to_currency) === functionalCurrency &&
      Number(row.rate) > 0,
  );
  if (direct) {
    return {
      transaction_currency: currency,
      functional_currency: functionalCurrency,
      exchange_rate: Number(direct.rate),
      effective_date: postingDate,
      rate_id: direct.id,
      source: "CONFIGURED_DIRECT",
    };
  }

  const inverse = activeRates.find(
    (row) =>
      upper(row.base_currency || row.from_currency) === functionalCurrency &&
      upper(row.quote_currency || row.to_currency) === currency &&
      Number(row.rate) > 0,
  );
  if (inverse) {
    return {
      transaction_currency: currency,
      functional_currency: functionalCurrency,
      exchange_rate: 1 / Number(inverse.rate),
      effective_date: postingDate,
      rate_id: inverse.id,
      source: "CONFIGURED_INVERSE",
    };
  }

  throw new Error(
    `No effective Finance exchange rate configured for ${currency}/${functionalCurrency} on ${postingDate}`,
  );
}

export const FinanceExchangeRateResolver = Object.freeze({
  resolve: resolveFinanceExchangeRate,
});
