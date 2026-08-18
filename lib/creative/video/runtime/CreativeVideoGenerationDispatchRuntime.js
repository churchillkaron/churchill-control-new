import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  PRODUCTION_TASK_STATUS,
} from "@/lib/operations/tasks/documents/ProductionTask";
import {
  CreativeVideoGenerationPreflightRuntime,
} from "./CreativeVideoGenerationPreflightRuntime";

const APPROVAL_CONTRACT = "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function authorization(task = {}) {
  const value = object(task.metadata?.media_generation_authorization);
  return value.contract === APPROVAL_CONTRACT ? value : null;
}

function assertAuthorization({ task, approved, preflightSha256 }) {
  if (!approved) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_APPROVAL_REQUIRED");
  }
  if (approved.media_generation_authorized !== true) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_GENERATION_NOT_AUTHORIZED");
  }
  if (approved.publication_authorized !== false) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_PUBLICATION_BOUNDARY_INVALID");
  }
  if (approved.consumed === true || text(approved.consumed_at)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_AUTHORIZATION_ALREADY_CONSUMED");
  }
  if (text(approved.task_id) !== text(task.id)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_TASK_SCOPE_MISMATCH");
  }
  if (text(approved.organization_id) !== text(task.organization_id)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_ORGANIZATION_SCOPE_MISMATCH");
  }
  if (text(approved.creative_project_id) !== text(task.creative_project_id)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_PROJECT_SCOPE_MISMATCH");
  }
  if (text(approved.production_graph_id) !== text(task.production_graph_id)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_GRAPH_SCOPE_MISMATCH");
  }
  if (!text(preflightSha256)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_PREFLIGHT_HASH_REQUIRED");
  }
  if (text(approved.preflight_sha256) !== text(preflightSha256)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_APPROVED_PREFLIGHT_HASH_MISMATCH");
  }

  CreativeVideoGenerationPreflightRuntime.serviceExecutionPreflight(
    object(approved.video_generation_preflight),
  );
}

export async function dispatchCreativeVideoGeneration({
  task_id,
  preflight_sha256,
  actor = {},
} = {}) {
  if (!task_id) throw new Error("CREATIVE_VIDEO_DISPATCH_TASK_ID_REQUIRED");

  const task = await ProductionTaskRuntime.get(task_id);
  if (!task) throw new Error("CREATIVE_VIDEO_DISPATCH_TASK_NOT_FOUND");
  if (task.status !== PRODUCTION_TASK_STATUS.WAITING) {
    throw new Error(`CREATIVE_VIDEO_DISPATCH_TASK_STATUS_INVALID:${task.status}`);
  }

  const approved = authorization(task);
  assertAuthorization({
    task,
    approved,
    preflightSha256: preflight_sha256,
  });

  const currentPreflight = await CreativeVideoGenerationPreflightRuntime.resolve({
    task_id: task.id,
    currency: approved.currency || null,
  });
  if (text(currentPreflight.preflight_sha256) !== text(approved.preflight_sha256)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_PREFLIGHT_DRIFT_REAPPROVAL_REQUIRED");
  }
  if (text(currentPreflight.preflight_sha256) !== text(preflight_sha256)) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_REVIEWED_PREFLIGHT_STALE");
  }

  const workerId = `creative-video-dispatch:${task.id}:${crypto.randomUUID()}`;
  const claimed = await ProductionTaskRuntime.claimForDispatch({
    id: task.id,
    organization_id: task.organization_id,
    expected_status: PRODUCTION_TASK_STATUS.WAITING,
    worker_id: workerId,
  });

  if (!claimed) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_ALREADY_CLAIMED");
  }

  const claimedAuthorization = authorization(claimed);
  assertAuthorization({
    task: claimed,
    approved: claimedAuthorization,
    preflightSha256: preflight_sha256,
  });

  const dispatchStartedAt = new Date().toISOString();
  const consumedAuthorization = {
    ...claimedAuthorization,
    consumed: true,
    consumed_at: dispatchStartedAt,
    dispatch_worker_id: workerId,
    dispatched_by_user_id: actor.user_id || null,
    dispatched_by_staff_account_id: actor.staff_account_id || null,
  };

  const prepared = await ProductionTaskRuntime.update(claimed.id, {
    timing: {
      ...object(claimed.timing),
      started_at: claimed.timing?.started_at || dispatchStartedAt,
    },
    metadata: {
      ...object(claimed.metadata),
      media_generation_authorization: consumedAuthorization,
      media_generation_authorized: true,
      publication_authorized: false,
      dispatch_worker_id: workerId,
      dispatch_preflight_sha256: currentPreflight.preflight_sha256,
      dispatch_started_at: dispatchStartedAt,
      dispatched_by_user_id: actor.user_id || null,
      dispatched_by_staff_account_id: actor.staff_account_id || null,
    },
  });

  const result = await ProductionTaskRuntime.dispatchClaimed(prepared.id, {
    worker_id: workerId,
  });

  return {
    contract: "CREATIVE_VIDEO_GENERATION_DISPATCH_V1",
    task: result,
    preflight: currentPreflight,
    dispatch_worker_id: workerId,
    authorization_consumed: true,
    publication_authorized: false,
  };
}

export const CreativeVideoGenerationDispatchRuntime = Object.freeze({
  contract: "CREATIVE_VIDEO_GENERATION_DISPATCH_V1",
  dispatch: dispatchCreativeVideoGeneration,
});
