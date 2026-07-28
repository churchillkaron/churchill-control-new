import crypto from "node:crypto";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";
import {
  CreativeExecutionContextRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionContextRuntime";

const TABLE = "creative_execution_steps";

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

async function findByKey({ job_id, step_key }) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("job_id", job_id)
    .eq("step_key", step_key)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function controlledError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
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

    const context = CreativeExecutionContextRuntime.current();
    const imported = payload?.imported_from_legacy_execution === true;
    const existing = await findByKey({ job_id, step_key });

    if (existing?.input_fingerprint && existing.input_fingerprint !== input_fingerprint) {
      throw controlledError(
        "CREATIVE_EXECUTION_STEP_INPUT_MISMATCH",
        "CREATIVE_EXECUTION_STEP_INPUT_MISMATCH",
      );
    }

    if (["COMPLETED", "AMBIGUOUS"].includes(existing?.status)) {
      return {
        ...existing,
        lease_acquired: false,
      };
    }

    if (existing?.status === "RUNNING" && existing?.lease_expires_at) {
      const expiresAt = Date.parse(existing.lease_expires_at);
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        throw controlledError(
          "CREATIVE_EXECUTION_STEP_BUSY",
          "CREATIVE_EXECUTION_STEP_BUSY",
        );
      }
    }

    if (!imported && context) {
      const limit = Math.max(1, Number(context.maximum_new_provider_steps || 1));
      const used = Math.max(0, Number(context.new_provider_steps || 0));
      if (used >= limit) {
        throw controlledError(
          "CREATIVE_EXECUTION_BATCH_LIMIT_REACHED",
          "CREATIVE_EXECUTION_BATCH_LIMIT_REACHED",
        );
      }
      if (typeof context.heartbeat === "function") {
        await context.heartbeat({
          stage: "VERIFYING_FRAME",
          message: "Refreshing lease before paid frame verification",
          current_step_key: step_key,
          batch_provider_steps_completed: used,
          batch_provider_step_limit: limit,
        });
      }
    }

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
    const leaseAcquired =
      data?.status === "RUNNING" && data?.lease_token === requestedLeaseToken;

    if (data?.status === "RUNNING" && !leaseAcquired) {
      throw controlledError(
        "CREATIVE_EXECUTION_STEP_BUSY",
        "CREATIVE_EXECUTION_STEP_BUSY",
      );
    }

    if (!imported && leaseAcquired && context) {
      context.new_provider_steps =
        Math.max(0, Number(context.new_provider_steps || 0)) + 1;
    }

    return {
      ...data,
      lease_acquired: leaseAcquired,
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
