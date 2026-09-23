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

  const submitted = await supabaseAdmin.rpc(
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

  if (submitted.error) throw submitted.error;
  const row = firstRow(submitted.data);
  if (!row?.id) {
    throw new Error("AVANTIQO_LOCAL_COMPUTE_IDEMPOTENT_SUBMIT_FAILED");
  }

  return {
    id: row.id,
    status: row.status || "QUEUED",
    replay: row.created_at ? false : null,
    execution_key: executionKey,
    request_hash: requestHash,
  };
}

export const AvantiqoLocalComputeEnqueueRuntime = Object.freeze({
  contract: AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT,
  key: localComputeExecutionKey,
  requestHash: localComputeRequestHash,
  enqueue: enqueueLocalComputeJob,
});
