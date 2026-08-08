import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const TABLE = "creative_production_tasks";
const CONTRACT = "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";
const DISPATCH_CONTRACT = "CREATIVE_SINGLE_MEDIA_DISPATCH_CLAIM_V1";
const FLAG = Symbol.for(
  "avantiqo.creative.single-media-authorization-dispatch.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function authorization(task = {}) {
  return object(task.metadata?.media_generation_authorization);
}

function governed(task = {}) {
  return authorization(task).contract === CONTRACT;
}

function consumed(auth = {}) {
  return auth.consumed === true || Boolean(text(auth.consumed_at));
}

function providerJobId(task = {}) {
  return text(
    task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id ||
    task.output?.provider_submission?.output?.provider_job_id ||
    task.output?.provider_submission?.output?.output?.provider_job_id,
  ) || null;
}

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
    task.output?.provider_submission?.usage?.id,
  ) || null;
}

function submissionAccepted(task = {}) {
  const status = upper(task.status);
  if (status === "RUNNING") return Boolean(providerJobId(task));
  if (status !== "COMPLETED") return false;
  return Boolean(
    providerJobId(task) ||
    usageId(task) ||
    task.output?.provider_submission,
  );
}

async function claimWaitingTask(task = {}) {
  const auth = authorization(task);
  if (auth.media_generation_authorized !== true) {
    throw new Error("CREATIVE_SINGLE_MEDIA_AUTHORIZATION_REQUIRED");
  }
  if (auth.publication_authorized === true) {
    throw new Error("CREATIVE_SINGLE_MEDIA_PUBLICATION_SCOPE_INVALID");
  }
  if (consumed(auth)) {
    throw new Error("CREATIVE_SINGLE_MEDIA_AUTHORIZATION_ALREADY_CONSUMED");
  }

  const claimId = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  const claimedAuthorization = {
    ...auth,
    consumed: false,
    dispatch_claim: {
      contract: DISPATCH_CONTRACT,
      id: claimId,
      claimed_at: claimedAt,
    },
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: "RUNNING",
      timing: {
        ...object(task.timing),
        started_at: task.timing?.started_at || claimedAt,
      },
      metadata: {
        ...object(task.metadata),
        media_generation_authorization: claimedAuthorization,
        media_generation_authorized: true,
        publication_authorized: false,
        single_media_dispatch_claim: {
          contract: DISPATCH_CONTRACT,
          id: claimId,
          claimed_at: claimedAt,
        },
      },
      updated_at: claimedAt,
    })
    .eq("id", task.id)
    .eq("status", "WAITING")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("CREATIVE_SINGLE_MEDIA_DISPATCH_ALREADY_CLAIMED");
  }

  return {
    task: data,
    claim_id: claimId,
  };
}

async function releaseUnsubmittedClaim(taskId, claimId) {
  const latest = await ProductionTaskRuntime.get(taskId);
  if (!latest) return;
  if (upper(latest.status) !== "RUNNING" || providerJobId(latest)) return;

  const currentClaim = object(latest.metadata?.single_media_dispatch_claim);
  if (text(currentClaim.id) !== text(claimId)) return;

  const auth = authorization(latest);
  if (consumed(auth)) return;

  const releasedAt = new Date().toISOString();
  await supabaseAdmin
    .from(TABLE)
    .update({
      status: "WAITING",
      metadata: {
        ...object(latest.metadata),
        media_generation_authorization: {
          ...auth,
          dispatch_claim: {
            ...object(auth.dispatch_claim),
            released_at: releasedAt,
          },
        },
        single_media_dispatch_claim: {
          ...currentClaim,
          released_at: releasedAt,
        },
      },
      updated_at: releasedAt,
    })
    .eq("id", taskId)
    .eq("status", "RUNNING");
}

async function consumeAuthorization(task = {}, claimId = null) {
  if (!governed(task) || !submissionAccepted(task)) return task;

  const auth = authorization(task);
  if (consumed(auth)) return task;

  const currentClaim = object(task.metadata?.single_media_dispatch_claim);
  if (claimId && text(currentClaim.id) !== text(claimId)) {
    throw new Error("CREATIVE_SINGLE_MEDIA_DISPATCH_CLAIM_MISMATCH");
  }

  const consumedAt = new Date().toISOString();
  return ProductionTaskRuntime.update(task.id, {
    metadata: {
      ...object(task.metadata),
      media_generation_authorization: {
        ...auth,
        consumed: true,
        consumed_at: consumedAt,
        media_generation_authorized: false,
        publication_authorized: false,
        provider_job_id: providerJobId(task),
        usage_id: usageId(task),
        dispatch_claim: {
          ...object(auth.dispatch_claim),
          consumed_at: consumedAt,
        },
      },
      media_generation_authorized: false,
      publication_authorized: false,
      single_media_authorization_consumed: {
        contract: CONTRACT,
        consumed: true,
        consumed_at: consumedAt,
        dispatch_claim_id: claimId || text(currentClaim.id) || null,
        provider_job_id: providerJobId(task),
        usage_id: usageId(task),
      },
    },
  });
}

async function enforceDispatch(dispatchWithoutGate, id) {
  const task = await ProductionTaskRuntime.get(id);
  if (!task) throw new Error("Production task not found");
  if (!governed(task)) return dispatchWithoutGate(id);

  const status = upper(task.status);
  const auth = authorization(task);

  if (status === "COMPLETED") return task;
  if (status === "RUNNING" && providerJobId(task)) {
    return dispatchWithoutGate(id);
  }
  if (status === "RUNNING") {
    throw new Error("CREATIVE_SINGLE_MEDIA_DISPATCH_ALREADY_CLAIMED");
  }
  if (status !== "WAITING") {
    throw new Error(`CREATIVE_SINGLE_MEDIA_TASK_STATUS_INVALID:${status}`);
  }
  if (consumed(auth)) {
    throw new Error("CREATIVE_SINGLE_MEDIA_AUTHORIZATION_ALREADY_CONSUMED");
  }

  const claim = await claimWaitingTask(task);
  try {
    const result = await dispatchWithoutGate(id);
    return consumeAuthorization(result, claim.claim_id);
  } catch (error) {
    await releaseUnsubmittedClaim(id, claim.claim_id);
    throw error;
  }
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatchWithoutSingleMediaGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchSingleMediaOneShot(id) {
    return enforceDispatch(dispatchWithoutSingleMediaGate, id);
  };
}

export const CreativeSingleMediaAuthorizationDispatchRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  dispatch_claim_contract: DISPATCH_CONTRACT,
  submissionAccepted,
  consumeAuthorization,
});
