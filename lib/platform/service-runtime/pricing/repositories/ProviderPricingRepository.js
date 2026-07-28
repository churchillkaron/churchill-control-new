import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

function applyScope(query, { country = null, currency = null } = {}) {
  let scoped = query;

  if (country) {
    scoped = scoped.or(`country.eq.${country},country.eq.*`);
  }

  if (currency) {
    scoped = scoped.or(`currency.eq.${currency},currency.is.null`);
  }

  return scoped;
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

  let query = supabaseAdmin
    .from("provider_pricing")
    .select("*")
    .eq("provider", provider)
    .eq("active", true);

  if (capability) {
    query = query.eq("capability", capability);
  }

  query = applyScope(query, { country, currency });

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function listCapabilityPricing({
  capability,
  country = null,
  currency = null,
} = {}) {
  if (!capability) {
    throw new Error("capability required");
  }

  let query = supabaseAdmin
    .from("provider_pricing")
    .select("*")
    .eq("capability", capability)
    .eq("active", true);

  query = applyScope(query, { country, currency });

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw new Error(error.message);
  return data || [];
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
