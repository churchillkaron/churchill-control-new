import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  PRODUCTION_TASK_STATUS,
} from "@/lib/operations/tasks/documents/ProductionTask";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import {
  CreativeVideoGenerationPreflightRuntime,
} from "./CreativeVideoGenerationPreflightRuntime";

const APPROVAL_CONTRACT = "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";
const APPROVAL_SCOPE = "VIDEO_GENERATION";

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

function consumed(authorization = {}) {
  return authorization.consumed === true || Boolean(text(authorization.consumed_at));
}

function taskAuthorization(task = {}) {
  const authorization = object(task.metadata?.media_generation_authorization);
  return authorization.contract === APPROVAL_CONTRACT
    ? authorization
    : null;
}

function activeAuthorization(task = {}) {
  const authorization = taskAuthorization(task);
  if (!authorization) return null;
  if (
    authorization.media_generation_authorized !== true ||
    authorization.publication_authorized !== false ||
    consumed(authorization)
  ) {
    return null;
  }
  return authorization;
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

function matchingDossier(nodes = [], task = {}) {
  return newest(nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER &&
    text(node.creative_project_id) === text(task.creative_project_id) &&
    text(node.metadata?.production_graph_id) === text(task.production_graph_id),
  ));
}

function matchingApprovalRecord(nodes = [], task = {}, preflight = {}) {
  return newest(nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD &&
    node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
    text(node.production_task_id) === text(task.id) &&
    text(node.metadata?.scope) === APPROVAL_SCOPE &&
    text(node.metadata?.preflight_sha256) === text(preflight.preflight_sha256),
  ));
}

function approvalIdentity(task = {}, preflight = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      task_id: task.id,
      creative_project_id: task.creative_project_id,
      production_graph_id: task.production_graph_id,
      preflight_sha256: preflight.preflight_sha256,
    }))
    .digest("hex");
}

function historicalApprovedPreflight(task = {}) {
  const authorization = taskAuthorization(task);
  if (!authorization) return null;
  const preflight = object(authorization.video_generation_preflight);
  if (!text(preflight.preflight_sha256)) return null;
  CreativeVideoGenerationPreflightRuntime.serviceExecutionPreflight(preflight);
  return preflight;
}

export async function inspectCreativeVideoGenerationApproval({
  task_id,
  currency = null,
} = {}) {
  const task = await ProductionTaskRuntime.get(task_id);
  if (!task) throw new Error("CREATIVE_VIDEO_APPROVAL_TASK_NOT_FOUND");

  const authorization = taskAuthorization(task);
  const active = activeAuthorization(task);
  const authorizationConsumed = Boolean(authorization && consumed(authorization));
  const historicalPreflight = historicalApprovedPreflight(task);
  const waiting = upper(task.status) === PRODUCTION_TASK_STATUS.WAITING;
  const preflight = waiting || !historicalPreflight
    ? await CreativeVideoGenerationPreflightRuntime.resolve({
        task_id,
        currency,
      })
    : historicalPreflight;

  const nodes = await CreativeAssetGraphRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const dossier = matchingDossier(nodes, task);
  const dossierApproval = dossier
    ? await CreativeApprovalRuntime.findCurrentApproval({
        organization_id: task.organization_id,
        subject_asset_node_id: dossier.id,
        scope: "PRODUCTION_DOSSIER",
      })
    : null;
  const existingRecord = matchingApprovalRecord(nodes, task, preflight);
  const samePreflight = Boolean(
    authorization &&
    text(authorization.preflight_sha256) === text(preflight.preflight_sha256),
  );
  const staleAuthorization = Boolean(
    active &&
    !samePreflight,
  );

  const blockingReasons = [];
  if (!waiting) {
    blockingReasons.push(`CREATIVE_VIDEO_APPROVAL_TASK_STATUS_INVALID:${upper(task.status)}`);
  }
  if (!dossier) {
    blockingReasons.push("CREATIVE_VIDEO_PRODUCTION_DOSSIER_REQUIRED");
  } else if (dossier.metadata?.passed !== true) {
    blockingReasons.push("CREATIVE_VIDEO_PRODUCTION_DOSSIER_NOT_PASSED");
  }
  if (dossier && !dossierApproval) {
    blockingReasons.push("CREATIVE_VIDEO_PRODUCTION_DOSSIER_APPROVAL_REQUIRED");
  }
  if (staleAuthorization) {
    blockingReasons.push("CREATIVE_VIDEO_EXISTING_AUTHORIZATION_PREFLIGHT_MISMATCH");
  }
  if (authorizationConsumed) {
    blockingReasons.push("CREATIVE_VIDEO_AUTHORIZATION_ALREADY_CONSUMED");
  }

  return {
    contract: "CREATIVE_VIDEO_GENERATION_APPROVAL_INSPECTION_V2",
    task,
    preflight,
    dossier,
    dossier_approval: dossierApproval,
    approval_record: existingRecord,
    authorization,
    active_authorization: active,
    approved: samePreflight,
    authorization_consumed: authorizationConsumed,
    execution_started: authorizationConsumed || upper(task.status) === PRODUCTION_TASK_STATUS.RUNNING,
    execution_completed: upper(task.status) === PRODUCTION_TASK_STATUS.COMPLETED,
    execution_failed: upper(task.status) === PRODUCTION_TASK_STATUS.FAILED,
    stale_authorization: staleAuthorization,
    can_approve:
      waiting &&
      !authorizationConsumed &&
      (samePreflight || blockingReasons.length === 0),
    blocking_reasons: blockingReasons,
  };
}

export async function approveCreativeVideoGeneration({
  task_id,
  preflight_sha256,
  approver,
  notes = "",
  currency = null,
} = {}) {
  if (!approver?.user_id || !approver?.staff_account_id) {
    throw new Error("CREATIVE_VIDEO_AUTHENTICATED_APPROVER_REQUIRED");
  }

  const inspection = await inspectCreativeVideoGenerationApproval({
    task_id,
    currency,
  });
  const {
    task,
    preflight,
    dossier,
    dossier_approval: dossierApproval,
    active_authorization: authorization,
    approval_record: existingRecord,
  } = inspection;

  if (inspection.authorization_consumed) {
    throw new Error("CREATIVE_VIDEO_APPROVAL_ALREADY_CONSUMED");
  }
  if (upper(task.status) !== PRODUCTION_TASK_STATUS.WAITING) {
    throw new Error(`CREATIVE_VIDEO_APPROVAL_TASK_STATUS_INVALID:${upper(task.status)}`);
  }
  if (text(preflight.preflight_sha256) !== text(preflight_sha256)) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_STALE_REVIEW_REQUIRED");
  }

  if (inspection.approved && authorization) {
    return {
      task,
      authorization,
      approval_record: existingRecord,
      preflight,
      reused: true,
    };
  }

  if (!inspection.can_approve) {
    throw new Error(
      `CREATIVE_VIDEO_APPROVAL_BLOCKED:${inspection.blocking_reasons.join("|")}`,
    );
  }
  if (!dossier || !dossierApproval) {
    throw new Error("CREATIVE_VIDEO_PRODUCTION_DOSSIER_APPROVAL_REQUIRED");
  }

  const approvedAt = new Date().toISOString();
  const record = existingRecord || await CreativeAssetGraphRuntime.create({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_task_id: task.id,
    parent_asset_node_id: dossier.id,
    type: CREATIVE_ASSET_NODE_TYPES.APPROVAL_RECORD,
    status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
    name: `${task.title || "Video generation"} approval`,
    description: "Authenticated task-bound video generation approval.",
    lineage: {
      source: "authenticated_staff_approval",
      capability: "creative.video.generation.approve",
      generation_version: 1,
    },
    review: {
      ai_reviewed: false,
      human_reviewed: true,
      approved: true,
      approved_by: approver.staff_account_id,
      notes: text(notes),
    },
    metadata: {
      approval_identity: approvalIdentity(task, preflight),
      scope: APPROVAL_SCOPE,
      task_id: task.id,
      production_graph_id: task.production_graph_id,
      preflight_contract: preflight.contract,
      preflight_sha256: preflight.preflight_sha256,
      pricing_id: preflight.pricing_id,
      provider: preflight.provider,
      model: preflight.model,
      resolution: preflight.resolution,
      aspect_ratio: preflight.aspect_ratio,
      quantity: preflight.quantity,
      unit: preflight.unit,
      currency: preflight.currency,
      customer_price: preflight.customer_price,
      pricing_dimensions: object(preflight.pricing_dimensions),
      production_dossier_asset_node_id: dossier.id,
      production_dossier_approval_record_asset_node_id: dossierApproval.id,
      publication_authorized: false,
      approver_user_id: approver.user_id,
      approver_staff_account_id: approver.staff_account_id,
      approver_email: approver.email || null,
      approved_at: approvedAt,
    },
    created_by: approver.user_id,
  });

  const exactCostGuard = {
    contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
    maximum_customer_price: preflight.customer_price,
    currency: preflight.currency,
    reference: `${preflight.contract}:${preflight.preflight_sha256}`,
    estimated_quantity: preflight.quantity,
  };

  const sealedAuthorization = {
    contract: APPROVAL_CONTRACT,
    media_generation_authorized: true,
    publication_authorized: false,
    consumed: false,
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    task_id: task.id,
    source_asset_id: preflight.source_asset_id,
    capability: preflight.capability,
    provider: preflight.provider,
    model: preflight.model,
    resolution: preflight.resolution,
    aspect_ratio: preflight.aspect_ratio,
    quantity: preflight.quantity,
    duration_seconds: preflight.duration_seconds,
    unit: preflight.unit,
    maximum_customer_price: preflight.customer_price,
    currency: preflight.currency,
    pricing_id: preflight.pricing_id,
    pricing_dimensions: object(preflight.pricing_dimensions),
    preflight_sha256: preflight.preflight_sha256,
    video_generation_preflight: preflight,
    task_approval_record_asset_node_id: record.id,
    production_dossier_asset_node_id: dossier.id,
    production_dossier_approval_record_asset_node_id: dossierApproval.id,
    authorized_by_user_id: approver.user_id,
    authorized_by_staff_account_id: approver.staff_account_id,
    authorized_at: approvedAt,
  };

  const updated = await ProductionTaskRuntime.update(task.id, {
    cost: {
      ...object(task.cost),
      estimated: preflight.customer_price,
      approved: true,
      currency: preflight.currency,
    },
    input: {
      ...object(task.input),
      approved_cost_guard: exactCostGuard,
    },
    metadata: {
      ...object(task.metadata),
      media_generation_authorization: sealedAuthorization,
      approved_cost_guard: exactCostGuard,
      media_generation_authorized: true,
      publication_authorized: false,
      video_generation_preflight_sha256: preflight.preflight_sha256,
      video_generation_approval_record_asset_node_id: record.id,
    },
  });

  return {
    task: updated,
    authorization: sealedAuthorization,
    approval_record: record,
    preflight,
    reused: Boolean(existingRecord),
  };
}

export const CreativeVideoGenerationApprovalRuntime = Object.freeze({
  contract: APPROVAL_CONTRACT,
  scope: APPROVAL_SCOPE,
  inspect: inspectCreativeVideoGenerationApproval,
  approve: approveCreativeVideoGeneration,
});
