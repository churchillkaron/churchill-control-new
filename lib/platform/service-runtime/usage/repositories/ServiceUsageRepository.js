import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "platform_service_usage";

export async function create(record) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(record)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function listByOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}
