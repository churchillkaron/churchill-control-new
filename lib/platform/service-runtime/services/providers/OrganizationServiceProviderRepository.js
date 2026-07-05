import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "organization_service_providers";

export async function listOrganizationServiceProviders({
  organization_id,
  organization_service_id,
  provider_id,
} = {}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });

  if (organization_id) {
    query = query.eq("organization_id", organization_id);
  }

  if (organization_service_id) {
    query = query.eq("organization_service_id", organization_service_id);
  }

  if (provider_id) {
    query = query.eq("provider_id", provider_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getOrganizationServiceProvider({
  organization_id,
  organization_service_id,
  provider_id,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!organization_service_id) throw new Error("organization_service_id required");
  if (!provider_id) throw new Error("provider_id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("organization_service_id", organization_service_id)
    .eq("provider_id", provider_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function upsertOrganizationServiceProvider({
  organization_id,
  organization_service_id,
  provider_id,
  provider_status = "not_connected",
  authorization_status = "not_authorized",
  credential_reference = null,
  configuration = {},
  health = "unknown",
  last_sync = null,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!organization_service_id) throw new Error("organization_service_id required");
  if (!provider_id) throw new Error("provider_id required");

  const payload = {
    organization_id,
    organization_service_id,
    provider_id,
    provider_status,
    authorization_status,
    credential_reference,
    configuration,
    health,
    last_sync,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, {
      onConflict: "organization_id,organization_service_id,provider_id",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
