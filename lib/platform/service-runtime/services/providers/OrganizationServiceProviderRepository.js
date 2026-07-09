import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "organization_service_providers";

export async function listByOrganization({
  organization_id,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq(
      "organization_id",
      organization_id
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}


export async function listByService({
  organization_id,
  organization_service_id,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!organization_service_id) {
    throw new Error("organization_service_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq(
      "organization_id",
      organization_id
    )
    .eq(
      "organization_service_id",
      organization_service_id
    );

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}


export async function getByProvider({
  organization_id,
  provider_id,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!provider_id) {
    throw new Error("provider_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq(
      "organization_id",
      organization_id
    )
    .eq(
      "provider_id",
      provider_id
    )
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

  if (!record.provider_id) {
    throw new Error("provider_id required");
  }

  const payload = {
    ...record,
    updated_at:
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
