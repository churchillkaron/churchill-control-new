import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "organization_services";

export async function listByOrganization(organization_id) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getByService({
  organization_id,
  service_id,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!service_id) {
    throw new Error("service_id required");
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("service_id", service_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function save(record) {
  if (!record.organization_id) {
    throw new Error("organization_id required");
  }

  if (!record.service_id) {
    throw new Error("service_id required");
  }

  const payload = {
    ...record,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, {
      onConflict: "organization_id,service_id",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
