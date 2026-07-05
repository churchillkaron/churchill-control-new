import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_provider_jobs";

export async function create(job) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(job)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function list({
  organization_id,
  creative_project_id,
} = {}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (organization_id) {
    query = query.eq("organization_id", organization_id);
  }

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function updateByProviderJobId(
  provider_job_id,
  values,
) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_job_id", provider_job_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
