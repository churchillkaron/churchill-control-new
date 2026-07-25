import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_nodes";

export async function create(node) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(node)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
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

export async function claimPublishCommand({
  command_id,
  organization_id,
  execution_identity,
  worker_id,
  lease_seconds = 900,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_publish_command",
    {
      p_command_id: command_id,
      p_organization_id: organization_id,
      p_execution_identity: execution_identity,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function settlePublishCommand({
  command_id,
  organization_id,
  execution_identity,
  lease_token,
  execution_asset_node_id,
  status,
  evidence = {},
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "settle_creative_publish_command",
    {
      p_command_id: command_id,
      p_organization_id: organization_id,
      p_execution_identity: execution_identity,
      p_lease_token: lease_token,
      p_execution_asset_node_id: execution_asset_node_id,
      p_status: status,
      p_evidence: evidence,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function claimPublishReconciliation({
  execution_id,
  organization_id,
  provider_id,
  provider_job_id,
  worker_id,
  lease_seconds = 900,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_publish_reconciliation",
    {
      p_execution_id: execution_id,
      p_organization_id: organization_id,
      p_provider_id: provider_id,
      p_provider_job_id: provider_job_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function recordPublishProgress({
  execution_id,
  organization_id,
  provider_id,
  provider_job_id,
  provider_status,
  evidence = {},
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "record_creative_publish_progress",
    {
      p_execution_id: execution_id,
      p_organization_id: organization_id,
      p_provider_id: provider_id,
      p_provider_job_id: provider_job_id,
      p_provider_status: provider_status,
      p_evidence: evidence,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function settlePublishReconciliation({
  execution_id,
  organization_id,
  lease_token,
  status,
  evidence = {},
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "settle_creative_publish_reconciliation",
    {
      p_execution_id: execution_id,
      p_organization_id: organization_id,
      p_lease_token: lease_token,
      p_status: status,
      p_evidence: evidence,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function findReusable({
  organization_id,
  type,
  tags = [],
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("reuse->>approved_for_reuse", "true")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!tags.length) return data || [];

  return (data || []).filter((row) => {
    const rowTags = row?.intelligence?.tags || [];
    return tags.some((tag) => rowTags.includes(tag));
  });
}
