import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_production_tasks";
const PRESERVE_ON_RESUME = [
  "RUNNING",
  "REVIEW",
  "APPROVED",
  "COMPLETED",
];
const RESET_ON_REMATERIALIZE = new Set([
  "FAILED",
  "SKIPPED",
  "REJECTED",
  "BLOCKED",
]);

function singleRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function normalizeRow(row = null) {
  if (!row) return row;

  return {
    ...row,
    service_code:
      row.metadata?.service_code ||
      row.service_id ||
      null,
  };
}

function sanitizePayload(values = {}, { current = null } = {}) {
  const payload = {
    ...values,
  };
  const serviceCode =
    values.service_code ||
    values.metadata?.service_code ||
    values.service_id ||
    current?.metadata?.service_code ||
    current?.service_id ||
    null;

  payload.metadata = {
    ...(current?.metadata || {}),
    ...(values.metadata || {}),
    service_code: serviceCode,
  };

  if (!payload.service_id && serviceCode) {
    payload.service_id = serviceCode;
  }

  delete payload.service_code;
  delete payload.organizationId;
  delete payload.creativeProjectId;
  delete payload.productionGraphId;
  delete payload.sceneId;
  delete payload.shotId;
  delete payload.providerId;
  delete payload.serviceId;

  return payload;
}

function rematerializedFailureMetadata(existing = {}, task = {}) {
  const qualityReview = existing.metadata?.quality_review || null;
  const correctionInstructions = qualityReview
    ? existing.metadata?.correction_instructions || []
    : [];

  return {
    ...(existing.metadata || {}),
    ...(task.metadata || {}),
    attempt: 0,
    provider_job_id: null,
    provider_status: null,
    worker_id: null,
    structured_failure: null,
    quality_review: qualityReview,
    correction_instructions: correctionInstructions,
    contact_sheet_url: null,
    rematerialized_after_failure: true,
    rematerialized_at: new Date().toISOString(),
  };
}

export async function create(task = {}) {
  const existing = await getById(task.id);

  if (
    existing &&
    PRESERVE_ON_RESUME.includes(existing.status)
  ) {
    return existing;
  }

  const resetFailure = Boolean(
    existing && RESET_ON_REMATERIALIZE.has(existing.status),
  );
  const merged = existing
    ? {
        ...task,
        output: resetFailure
          ? task.output || {}
          : existing.output || task.output || {},
        metadata: resetFailure
          ? rematerializedFailureMetadata(existing, task)
          : {
              ...(task.metadata || {}),
              ...(existing.metadata || {}),
            },
        timing: resetFailure
          ? {
              ...(task.timing || {}),
              started_at: null,
              completed_at: null,
            }
          : {
              ...(task.timing || {}),
              ...(existing.timing || {}),
            },
        error: resetFailure ? null : task.error,
        worker_id: resetFailure ? null : existing.worker_id,
        lease_expires_at: resetFailure ? null : existing.lease_expires_at,
        next_attempt_at: resetFailure ? null : existing.next_attempt_at,
        dead_lettered_at: resetFailure ? null : existing.dead_lettered_at,
        created_at:
          existing.created_at || task.created_at,
      }
    : task;
  const payload = sanitizePayload(merged, {
    current: existing,
  });

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeRow(data);
}

export async function update(id, values = {}, scope = {}) {
  const current = await getById(id, scope);

  if (!current) {
    throw new Error("PRODUCTION_TASK_NOT_FOUND");
  }

  const payload = sanitizePayload(values, {
    current,
  });

  delete payload.id;
  delete payload.created_at;
  delete payload.created_by;

  let query = supabaseAdmin
    .from(TABLE)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (scope.organization_id) {
    query = query.eq(
      "organization_id",
      scope.organization_id,
    );
  }

  if (scope.creative_project_id) {
    query = query.eq(
      "creative_project_id",
      scope.creative_project_id,
    );
  }

  const { data, error } = await query
    .select()
    .single();

  if (error) throw error;
  return normalizeRow(data);
}

export async function getById(id, scope = {}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id);

  if (scope.organization_id) {
    query = query.eq(
      "organization_id",
      scope.organization_id,
    );
  }

  if (scope.creative_project_id) {
    query = query.eq(
      "creative_project_id",
      scope.creative_project_id,
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return normalizeRow(data || null);
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function listRunnableProjects({
  limit = 25,
} = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      "organization_id, creative_project_id, status, next_attempt_at, lease_expires_at",
    )
    .in(
      "status",
      ["PLANNED", "WAITING", "READY", "RUNNING"],
    )
    .is("dead_lettered_at", null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(
      Math.max(
        1,
        Math.min(Number(limit || 25), 100),
      ),
    );

  if (error) throw error;

  const seen = new Set();
  const projects = [];

  for (const row of data || []) {
    if (!row.organization_id || !row.creative_project_id) {
      continue;
    }

    const key =
      `${row.organization_id}:${row.creative_project_id}`;

    if (seen.has(key)) continue;

    seen.add(key);
    projects.push({
      organization_id: row.organization_id,
      creative_project_id: row.creative_project_id,
    });
  }

  return projects;
}

export async function claimReady({
  task_id,
  worker_id,
  lease_seconds = 120,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_production_task",
    {
      p_task_id: task_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );

  if (error) throw error;
  return normalizeRow(singleRpcRow(data));
}

export async function leaseRunning({
  task_id,
  worker_id,
  lease_seconds = 120,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "lease_running_creative_production_task",
    {
      p_task_id: task_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );

  if (error) throw error;
  return normalizeRow(singleRpcRow(data));
}

export async function heartbeat({
  task_id,
  worker_id,
  lease_seconds = 120,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "heartbeat_creative_production_task",
    {
      p_task_id: task_id,
      p_worker_id: worker_id,
      p_lease_seconds: lease_seconds,
    },
  );

  if (error) throw error;
  return data === true;
}

export async function releaseLease({
  task_id,
  worker_id,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "release_creative_production_task_lease",
    {
      p_task_id: task_id,
      p_worker_id: worker_id,
    },
  );

  if (error) throw error;
  return data === true;
}
