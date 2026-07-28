import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "creative_execution_jobs";

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export const CreativeExecutionJobRepository = {
  async enqueue(job = {}) {
    requireValue(job.organization_id, "organization_id required");
    requireValue(job.job_type, "job_type required");
    requireValue(job.idempotency_key, "idempotency_key required");

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .upsert({
        ...job,
        status: job.status || "QUEUED",
        payload: job.payload || {},
        progress: job.progress || {},
        priority: Number(job.priority ?? 100),
        maximum_attempts: Number(job.maximum_attempts ?? 20),
        next_attempt_at: job.next_attempt_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "organization_id,idempotency_key",
        ignoreDuplicates: true,
      })
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) return { job: data, created: true };

    const existing = await this.findByIdentity({
      organization_id: job.organization_id,
      idempotency_key: job.idempotency_key,
    });
    if (!existing) throw new Error("CREATIVE_EXECUTION_JOB_IDEMPOTENCY_LOOKUP_FAILED");
    return { job: existing, created: false };
  },

  async findByIdentity({ organization_id, idempotency_key }) {
    requireValue(organization_id, "organization_id required");
    requireValue(idempotency_key, "idempotency_key required");

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },

  async getById(id) {
    requireValue(id, "job id required");

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },

  async listByProject({ organization_id, creative_project_id }) {
    requireValue(organization_id, "organization_id required");
    requireValue(creative_project_id, "creative_project_id required");

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("creative_project_id", creative_project_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async claim({ worker_id, job_types = null, lease_seconds = 120 }) {
    requireValue(worker_id, "worker_id required");

    const { data, error } = await supabaseAdmin.rpc(
      "claim_creative_execution_job",
      {
        p_worker_id: worker_id,
        p_job_types: Array.isArray(job_types) && job_types.length
          ? job_types
          : null,
        p_lease_seconds: Number(lease_seconds || 120),
      },
    );

    if (error) throw error;
    return data || null;
  },

  async heartbeat({
    job_id,
    lease_token,
    progress = {},
    lease_seconds = 120,
  }) {
    requireValue(job_id, "job_id required");
    requireValue(lease_token, "lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "heartbeat_creative_execution_job",
      {
        p_job_id: job_id,
        p_lease_token: lease_token,
        p_progress: progress || {},
        p_lease_seconds: Number(lease_seconds || 120),
      },
    );

    if (error) throw error;
    return data;
  },

  async yield({
    job_id,
    lease_token,
    progress = {},
    delay_seconds = 0,
  }) {
    requireValue(job_id, "job_id required");
    requireValue(lease_token, "lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "yield_creative_execution_job",
      {
        p_job_id: job_id,
        p_lease_token: lease_token,
        p_progress: progress || {},
        p_delay_seconds: Number(delay_seconds || 0),
      },
    );

    if (error) throw error;
    return data;
  },

  async complete({ job_id, lease_token, result = {}, progress = {} }) {
    requireValue(job_id, "job_id required");
    requireValue(lease_token, "lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "complete_creative_execution_job",
      {
        p_job_id: job_id,
        p_lease_token: lease_token,
        p_result: result || {},
        p_progress: progress || {},
      },
    );

    if (error) throw error;
    return data;
  },

  async retry({
    job_id,
    lease_token,
    error: failure = {},
    progress = {},
    delay_seconds = 30,
  }) {
    requireValue(job_id, "job_id required");
    requireValue(lease_token, "lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "retry_creative_execution_job",
      {
        p_job_id: job_id,
        p_lease_token: lease_token,
        p_error: failure || {},
        p_progress: progress || {},
        p_delay_seconds: Number(delay_seconds || 30),
      },
    );

    if (error) throw error;
    return data;
  },
};
