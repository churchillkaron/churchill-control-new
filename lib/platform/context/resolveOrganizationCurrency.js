import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeCurrency(value) {
  const currency = String(value || "")
    .trim()
    .toUpperCase();

  return /^[A-Z]{3}$/.test(currency)
    ? currency
    : null;
}

function currencyFromOrganization(row = {}) {
  return normalizeCurrency(
    row.default_currency ||
    row.currency ||
    row.base_currency ||
    row.functional_currency ||
    row.metadata?.currency ||
    row.settings?.currency,
  );
}

async function organizationCurrency(organization_id) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organization_id)
    .maybeSingle();

  if (error) throw error;
  return currencyFromOrganization(data || {});
}

async function legalEntityCurrency({
  organization_id,
  entity_id = null,
}) {
  let query = supabaseAdmin
    .from("legal_entities")
    .select("currency")
    .eq("organization_id", organization_id);

  if (entity_id) {
    query = query.eq("id", entity_id);
  }

  const { data, error } = await query.limit(1);

  if (error) throw error;
  return normalizeCurrency(data?.[0]?.currency);
}

export async function resolveOrganizationCurrency({
  organization_id,
  entity_id = null,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const organization = await organizationCurrency(organization_id);
  if (organization) return organization;

  const entity = await legalEntityCurrency({
    organization_id,
    entity_id,
  });

  if (entity) return entity;

  throw new Error("ORGANIZATION_CURRENCY_CONFIGURATION_REQUIRED");
}
