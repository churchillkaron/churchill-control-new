import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  preparePromptlessPersistence,
} from "@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime";

const TABLE = "creative_production_tasks";

function promptlessTask(value, label) {
  return preparePromptlessPersistence(value, label);
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

export async function create(task) {
  const payload = promptlessTask(task, "CREATIVE_PRODUCTION_TASK");
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values) {
  const payload = promptlessTask(
    {
      ...values,
      updated_at: new Date().toISOString(),
    },
    "CREATIVE_PRODUCTION_TASK_UPDATE",
  );
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function claimForExecution(id, {
  worker_id,
  lease_seconds = 120,
} = {}) {
  if (!id) throw new Error("PRODUCTION_TASK_ID_REQUIRED");
  if (!worker_id) throw new Error("PRODUCTION_TASK_WORKER_ID_REQUIRED");

  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_production_task",
    {
      p_task_id: id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );

  if (error) throw error;
  return firstRow(data);
}

export async function leaseRunning(id, {
  worker_id,
  lease_seconds = 120,
} = {}) {
  if (!id) throw new Error("PRODUCTION_TASK_ID_REQUIRED");
  if (!worker_id) throw new Error("PRODUCTION_TASK_WORKER_ID_REQUIRED");

  const { data, error } = await supabaseAdmin.rpc(
    "lease_running_creative_production_task",
    {
      p_task_id: id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );

  if (error) throw error;
  return firstRow(data);
}

export async function releaseLease(id, {
  worker_id,
} = {}) {
  if (!id) throw new Error("PRODUCTION_TASK_ID_REQUIRED");
  if (!worker_id) throw new Error("PRODUCTION_TASK_WORKER_ID_REQUIRED");

  const { data, error } = await supabaseAdmin.rpc(
    "release_creative_production_task_lease",
    {
      p_task_id: id,
      p_worker_id: worker_id,
    },
  );

  if (error) throw error;
  return data === true;
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

export async function listByProject({
  organization_id,
  creative_project_id,
  production_graph_id,
} = {}) {
  if (!organization_id) {
    throw new Error("PRODUCTION_TASK_ORGANIZATION_SCOPE_REQUIRED");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  if (production_graph_id) {
    query = query.eq("production_graph_id", production_graph_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function listOrganizationTaskExceptions({
  organization_id,
  since,
  limit = 100,
} = {}) {
  if (!organization_id) {
    throw new Error("PRODUCTION_TASK_ORGANIZATION_SCOPE_REQUIRED");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select(
      "id,creative_project_id,production_graph_id,type,status,title,capability,provider_id,error,timing,created_at,updated_at",
    )
    .eq("organization_id", organization_id)
    .in("status", ["FAILED", "RUNNING"])
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));

  if (since) query = query.gte("updated_at", since);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
