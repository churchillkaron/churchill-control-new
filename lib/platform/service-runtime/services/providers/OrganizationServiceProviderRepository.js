import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listOrganizationServiceProviders({ organization_id, service_id } = {}) {
  let query = supabaseAdmin
    .from("organization_service_providers")
    .select("*")
    .order("created_at", { ascending: true });

  if (organization_id) query = query.eq("organization_id", organization_id);
  if (service_id) query = query.eq("service_id", service_id);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function upsertOrganizationServiceProvider({
  organization_id,
  organization_service_id,
  category_id,
  service_id,
  provider_id,
  status = "not_connected",
  health = "unknown",
  authorization_type = null,
  configuration = {},
  metadata = {},
}) {
  const payload = {
    organization_id,
    organization_service_id,
    category_id,
    service_id,
    provider_id,
    status,
    health,
    authorization_type,
    configuration,
    metadata,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("organization_service_providers")
    .upsert(payload, {
      onConflict: "organization_id,service_id,provider_id",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
