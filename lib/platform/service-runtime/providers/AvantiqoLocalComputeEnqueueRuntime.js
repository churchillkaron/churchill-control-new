import crypto from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/admin.js";

import {
  AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT,
  localComputeExecutionKey,
  localComputeRequestHash,
} from "./AvantiqoLocalComputeIdempotencyPolicy.js";

export {
  AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT,
  localComputeExecutionKey,
  localComputeRequestHash,
};

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function enqueueLocalComputeJob({
  organization_id,
  usage_id,
  capability,
  lane = "utility",
  workload,
  model = null,
  payload = {},
  priority = 0,
  max_attempts = 2,
  input = {},
} = {}) {
  if (!organization_id || !usage_id || !capability || !workload) {
    throw new Error("AVANTIQO_LOCAL_COMPUTE_QUEUE_SCOPE_REQUIRED");
  }

  const executionKey = localComputeExecutionKey({
    usage_id,
    capability,
    input,
  });
  if (!executionKey) {
    throw new Error("AVANTIQO_LOCAL_COMPUTE_EXECUTION_KEY_REQUIRED");
  }

  const requestHash = localComputeRequestHash({
    capability,
    lane,
    workload,
    model,
    payload,
  });

  let submitted;
  try {
    submitted = await supabaseAdmin.rpc(
      "submit_avantiqo_local_compute_job_idempotent",
      {
        p_organization_id: organization_id,
        p_usage_id: usage_id,
        p_capability: capability,
        p_lane: lane,
        p_workload: workload,
        p_model: model || null,
        p_payload: payload || {},
        p_priority: priority,
        p_max_attempts: max_attempts,
        p_execution_key: executionKey,
        p_request_hash: requestHash,
      },
    );
  } catch (cause) {
    const error = new Error(
      `${cause?.message || "AVANTIQO_LOCAL_COMPUTE_SUBMIT_FAILED"}:` +
      `execution_key=${executionKey}:request_hash=${requestHash}`,
    );
    error.code = cause?.code || null;
    error.execution_key = executionKey;
    error.request_hash = requestHash;
    error.original_error = cause;
    throw error;
  }

  if (submitted.error) {
    const error = new Error(
      `${submitted.error.message || "AVANTIQO_LOCAL_COMPUTE_SUBMIT_FAILED"}:` +
      `execution_key=${executionKey}:request_hash=${requestHash}`,
    );
    error.code = submitted.error.code || null;
    error.execution_key = executionKey;
    error.request_hash = requestHash;
    error.original_error = submitted.error;
    throw error;
  }
  let row = firstRow(submitted.data);
  if (!row?.id) {
    throw new Error("AVANTIQO_LOCAL_COMPUTE_IDEMPOTENT_SUBMIT_FAILED");
  }

  const staleResumeCancelled =
    String(row.status || "").toUpperCase() === "CANCELLED" &&
    ["STALE_VIDEO_STUDIO_RESUME_CANCELLED", "CANCELLED_BY_CALLER"].includes(
      String(row.error_code || "").toUpperCase(),
    ) &&
    String(usage_id || "").startsWith("creative-temporal:");

  if (staleResumeCancelled) {
    const now = new Date().toISOString();
    const revived = await supabaseAdmin
      .from("avantiqo_local_compute_jobs")
      .update({
        status: "QUEUED",
        payload: payload || {},
        priority: priority || 0,
        max_attempts: Math.max(1, Math.min(Number(max_attempts) || 2, 10)),
        attempts: 0,
        error_code: null,
        leased_until: null,
        started_at: null,
        completed_at: null,
        node_id: null,
        result: null,
        metrics: {},
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("execution_key", executionKey)
      .eq("request_hash", requestHash)
      .eq("status", "CANCELLED")
      .select("*")
      .maybeSingle();
    if (revived.error) {
      throw new Error(`AVANTIQO_LOCAL_COMPUTE_STALE_RESUME_REQUEUE_FAILED:${revived.error.message}`);
    }
    if (revived.data) row = revived.data;
  }

  return {
    id: row.id,
    status: row.status || "QUEUED",
    replay: row.created_at ? false : null,
    execution_key: executionKey,
    request_hash: requestHash,
    stale_resume_requeued: staleResumeCancelled,
  };
}

export const AvantiqoLocalComputeEnqueueRuntime = Object.freeze({
  contract: AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT,
  key: localComputeExecutionKey,
  requestHash: localComputeRequestHash,
  enqueue: enqueueLocalComputeJob,
});
