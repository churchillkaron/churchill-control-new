import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function missingColumn(error, column) {
  const message = text(error?.message).toLowerCase();
  return (
    String(error?.code || "") === "42703" ||
    message.includes("does not exist")
  ) && (
    message.includes(`provider_pricing.${column}`) ||
    message.includes(`column ${column}`) ||
    message.includes(`column \"${column}\"`)
  );
}

function applyScope(query, {
  country = null,
  currency = null,
  includeCountry = true,
  includeCurrency = true,
} = {}) {
  let scoped = query;

  if (includeCountry && country) {
    scoped = scoped.or(`country.eq.${country},country.eq.*`);
  }

  if (includeCurrency && currency) {
    scoped = scoped.or(`currency.eq.${currency},currency.is.null`);
  }

  return scoped;
}

function filterRowsForAvailableScope(rows, { country = null, currency = null } = {}) {
  const values = Array.isArray(rows) ? rows : [];
  const hasCountryColumn = values.some((row) =>
    Object.prototype.hasOwnProperty.call(row || {}, "country")
  );
  const hasCurrencyColumn = values.some((row) =>
    Object.prototype.hasOwnProperty.call(row || {}, "currency")
  );

  return values.filter((row) => {
    if (country && hasCountryColumn) {
      const rowCountry = text(row?.country);
      if (rowCountry !== country && rowCountry !== "*") return false;
    }

    if (currency && hasCurrencyColumn) {
      const rowCurrency = text(row?.currency);
      if (rowCurrency && rowCurrency !== currency) return false;
    }

    return true;
  });
}

async function executeScopedPricingQuery(buildQuery, scope = {}) {
  let includeCountry = Boolean(scope.country);
  let includeCurrency = Boolean(scope.currency);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const query = applyScope(buildQuery(), {
      ...scope,
      includeCountry,
      includeCurrency,
    });
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (!error) {
      return filterRowsForAvailableScope(data || [], scope);
    }

    let retry = false;

    if (includeCountry && missingColumn(error, "country")) {
      includeCountry = false;
      retry = true;
    }

    if (includeCurrency && missingColumn(error, "currency")) {
      includeCurrency = false;
      retry = true;
    }

    if (!retry) throw new Error(error.message);
  }

  throw new Error("PROVIDER_PRICING_SCOPE_RESOLUTION_FAILED");
}

export async function listProviderPricing({
  provider,
  capability = null,
  country = null,
  currency = null,
}) {
  if (!provider) {
    throw new Error("provider required");
  }

  return executeScopedPricingQuery(() => {
    let query = supabaseAdmin
      .from("provider_pricing")
      .select("*")
      .eq("provider", provider)
      .eq("active", true);

    if (capability) {
      query = query.eq("capability", capability);
    }

    return query;
  }, { country, currency });
}

export async function listCapabilityPricing({
  capability,
  country = null,
  currency = null,
} = {}) {
  if (!capability) {
    throw new Error("capability required");
  }

  return executeScopedPricingQuery(() =>
    supabaseAdmin
      .from("provider_pricing")
      .select("*")
      .eq("capability", capability)
      .eq("active", true),
  { country, currency });
}

export async function getProviderPricing({
  provider,
  capability = null,
  model = null,
  country = null,
  currency = null,
}) {
  const rows = await listProviderPricing({
    provider,
    capability,
    country,
    currency,
  });

  return rows.find((row) => !model || row.model === model) || null;
}

export async function getProviderPricingById(id) {
  if (!id) throw new Error("pricing id required");

  const { data, error } = await supabaseAdmin
    .from("provider_pricing")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

export const ProviderPricingRepository = {
  listProviderPricing,
  listCapabilityPricing,
  getProviderPricing,
  getProviderPricingById,
};
