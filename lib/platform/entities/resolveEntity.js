import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function resolveEntity({
  organizationId,
  entityId,
}) {
  if (!organizationId || !entityId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select(`
      id,
      organization_id,
      code,
      legal_name,
      display_name,
      tax_id,
      registration_number,
      country,
      currency,
      timezone,
      locale,
      address,
      phone,
      email,
      parent_entity_id,
      is_holding_company,
      is_default_accounting_entity,
      is_active
    `)
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}
