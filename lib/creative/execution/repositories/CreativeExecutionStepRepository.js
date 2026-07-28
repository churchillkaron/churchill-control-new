import crypto from "node:crypto";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "creative_execution_steps";

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export const CreativeExecutionStepRepository = {
  async claim({
    job_id,
    job_lease_token,
    step_key,
    step_type,
    input_fingerprint,
    payload = {},
    lease_seconds = 300,
  } = {}) {
    required(job_id, "job_id required");
    required(job_lease_token, "job_lease_token required");
    required(step_key, "step_key required");
    required(step_type, "step_type required");
    required(input_fingerprint, "input_fingerprint required");

    const requestedLeaseToken = crypto.randomUUID();
    const { data, error } = await supabaseAdmin.rpc(
      "claim_creative_execution_step_v2",
      {
        p_job_id: job_id,
        p_job_lease_token: job_lease_token,
        p_requested_step_lease_token: requestedLeaseToken,
        p_step_key: step_key,
        p_step_type: step_type,
        p_input_fingerprint: input_fingerprint,
        p_payload: payload || {},
        p_lease_seconds: Number(lease_seconds || 300),
      },
    );

    if (error) throw error;
    return {
      ...data,
      lease_acquired:
        data?.status === "RUNNING" && data?.lease_token === requestedLeaseToken,
    };
  },

  async complete({
    step_id,
    step_lease_token,
    result = {},
    usage_ids = [],
    provider_call_count = 0,
  } = {}) {
    required(step_id, "step_id required");
    required(step_lease_token, "step_lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "complete_creative_execution_step",
      {
        p_step_id: step_id,
        p_step_lease_token: step_lease_token,
        p_result: result || {},
        p_usage_ids: Array.isArray(usage_ids) ? usage_ids : [],
        p_provider_call_count: Number(provider_call_count || 0),
      },
    );

    if (error) throw error;
    return data;
  },

  async ambiguous({
    step_id,
    step_lease_token,
    result = {},
    error: failure = {},
    usage_ids = [],
    provider_call_count = 0,
  } = {}) {
    required(step_id, "step_id required");
    required(step_lease_token, "step_lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "mark_creative_execution_step_ambiguous",
      {
        p_step_id: step_id,
        p_step_lease_token: step_lease_token,
        p_result: result || {},
        p_error: failure || {},
        p_usage_ids: Array.isArray(usage_ids) ? usage_ids : [],
        p_provider_call_count: Number(provider_call_count || 0),
      },
    );

    if (error) throw error;
    return data;
  },

  async fail({
    step_id,
    step_lease_token,
    error: failure = {},
  } = {}) {
    required(step_id, "step_id required");
    required(step_lease_token, "step_lease_token required");

    const { data, error } = await supabaseAdmin.rpc(
      "fail_creative_execution_step",
      {
        p_step_id: step_id,
        p_step_lease_token: step_lease_token,
        p_error: failure || {},
      },
    );

    if (error) throw error;
    return data;
  },

  async reconcile({
    step_id,
    status,
    result = {},
    error: failure = {},
    usage_ids = [],
    provider_call_count = 0,
  } = {}) {
    required(step_id, "step_id required");
    required(status, "status required");

    const { data, error } = await supabaseAdmin.rpc(
      "reconcile_creative_execution_step",
      {
        p_step_id: step_id,
        p_status: String(status).toUpperCase(),
        p_result: result || {},
        p_error: failure || {},
        p_usage_ids: Array.isArray(usage_ids) ? usage_ids : [],
        p_provider_call_count: Number(provider_call_count || 0),
      },
    );

    if (error) throw error;
    return data;
  },

  async listByJob(job_id) {
    required(job_id, "job_id required");

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  },
};
