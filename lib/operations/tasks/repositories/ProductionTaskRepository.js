import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_production_tasks";

function singleRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function create(task) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(task)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function claim({ id, organization_id, worker_id, lease_seconds = 900 }) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_production_task",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function claimProviderCompletion({
  id,
  organization_id,
  provider_id,
  provider_job_id,
  worker_id,
  lease_seconds = 900,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_provider_completion",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_provider_id: provider_id,
      p_provider_job_id: provider_job_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function recordProviderProgress({
  id,
  organization_id,
  provider_id,
  provider_job_id,
  provider_status,
  output = {},
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "record_creative_provider_progress",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_provider_id: provider_id,
      p_provider_job_id: provider_job_id,
      p_provider_status: provider_status,
      p_output: output,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function submitPending({
  id,
  organization_id,
  lease_token,
  provider_id = null,
  output = {},
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "submit_creative_production_task",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_lease_token: lease_token,
      p_provider_id: provider_id,
      p_output: output,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function finalize({
  id,
  organization_id,
  status,
  output = {},
  error_message = null,
  lease_token = null,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "finalize_creative_production_task",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_status: status,
      p_output: output,
      p_error: error_message,
      p_lease_token: lease_token,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function failAttempt({
  id,
  organization_id,
  lease_token,
  error_message,
  retryable = true,
  retry_delay_seconds = 30,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "fail_creative_production_task_attempt",
    {
      p_task_id: id,
      p_organization_id: organization_id,
      p_lease_token: lease_token,
      p_error: error_message,
      p_retryable: retryable,
      p_retry_delay_seconds: retry_delay_seconds,
    },
  );
  if (error) throw error;
  return singleRow(data);
}

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function listByProject({ organization_id, creative_project_id }) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
