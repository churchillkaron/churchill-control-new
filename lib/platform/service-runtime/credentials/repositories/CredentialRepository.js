import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "provider_credentials";

export async function save(record) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .upsert(record)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function get(id) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listActiveByProvider(provider_id) {
  const providerId = String(provider_id || "").trim().toLowerCase();

  if (!providerId) {
    throw new Error("provider_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("provider_id", providerId)
    .eq("status", "ACTIVE");

  if (error) {
    throw error;
  }

  return data || [];
}
