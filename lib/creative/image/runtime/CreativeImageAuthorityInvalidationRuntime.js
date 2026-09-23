import crypto from "node:crypto";

import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeImageFoundationAuthorityRuntime } from "@/lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime";
import { isMaterialTruthSourceCurrent } from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";

export const CREATIVE_IMAGE_AUTHORITY_INVALIDATION_CONTRACT =
  "CREATIVE_IMAGE_AUTHORITY_INVALIDATION_V1";

const FOUNDATION_BOUND_CLASSES = new Set([
  "HERO_FRAME",
  "PERFORMANCE_REFERENCE",
  "CONTACT_DETAIL_REFERENCE",
  "TRANSITION_LOOKFRAME",
  "COMPOSITING_SOURCE",
  "STORYBOARD_FRAME",
]);

const TERMINAL_TASK_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function stableParentVersion(parent = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    id: parent.id || null,
    checksum: parent.technical?.checksum || null,
    selection_seal:
      parent.metadata?.image_asset_exploration_selection_seal_hash || null,
    localized_repair_review_task_id:
      parent.metadata?.localized_repair_review_task_id || null,
    image_asset_review_task_id:
      parent.metadata?.image_asset_review_task_id || null,
    perceptual_qc_sealed:
      parent.metadata?.image_asset_perceptual_qc_sealed === true,
  })).digest("hex");
}
function assetClass(node = {}) {
  return text(
    node.metadata?.image_asset_class ||
    node.metadata?.image_asset_authority?.asset_class,
  ).toUpperCase();
}
function sourceTaskId(node = {}) {
  return text(node.production_task_id || node.metadata?.production_task_id) || null;
}
function invalidationScope(node = {}) {
  return {
    scene_id:
      node.metadata?.scene_id ||
      node.metadata?.image_asset_authority?.scene_id ||
      null,
    shot_id:
      node.metadata?.shot_id ||
      node.metadata?.image_asset_authority?.shot_id ||
      null,
    continuity_group_id:
      node.metadata?.continuity_group_id ||
      node.metadata?.image_asset_authority?.continuity_group_id ||
      null,
  };
}
function sameScope(task = {}, scope = {}) {
  if (scope.shot_id && text(task.shot_id || task.metadata?.shot_id) === text(scope.shot_id)) {
    return true;
  }
  const taskGroup = text(
    task.input?.requirements?.generation_strategy?.shared_state_group_id ||
    task.input?.requirements?.continuity_group_id ||
    task.metadata?.continuity_group_id,
  );
  if (scope.continuity_group_id && taskGroup === text(scope.continuity_group_id)) {
    return true;
  }
  return Boolean(
    scope.scene_id &&
    text(task.scene_id || task.metadata?.scene_id) === text(scope.scene_id),
  );
}
function parentVersionCurrent(node = {}, nodes = []) {
  const parentId = text(node.metadata?.parent_image_asset_node_id);
  if (!parentId) return true;
  const expected = text(node.metadata?.parent_version_fingerprint);
  if (!expected) return false;
  const parent = nodes.find((candidate) => text(candidate.id) === parentId);
  return Boolean(parent && stableParentVersion(parent) === expected);
}
function foundationCurrent(node = {}, tasks = [], nodes = []) {
  const expected = text(node.metadata?.image_foundation_authority_digest);
  if (!expected || !FOUNDATION_BOUND_CLASSES.has(assetClass(node))) return true;
  const taskId = sourceTaskId(node);
  const task = tasks.find((candidate) => text(candidate.id) === text(taskId));
  if (!task) return false;
  const authority = CreativeImageFoundationAuthorityRuntime.evaluate({
    task,
    asset_nodes: nodes,
    force: true,
  });
  return authority.passed === true &&
    text(authority.foundation_authority_digest) === expected;
}
function staleReason(node = {}, tasks = [], nodes = []) {
  if (
    node.metadata?.material_truth_reference === true &&
    !isMaterialTruthSourceCurrent(node, nodes)
  ) {
    return "MATERIAL_TRUTH_SOURCE_AUTHORITY_CHANGED";
  }
  if (
    text(node.metadata?.parent_image_asset_node_id) &&
    !parentVersionCurrent(node, nodes)
  ) {
    return "PARENT_IMAGE_AUTHORITY_CHANGED";
  }
  if (!foundationCurrent(node, tasks, nodes)) {
    return "FOUNDATION_AUTHORITY_CHANGED";
  }
  return null;
}
function revocationMetadata(node = {}, reason) {
  const metadata = {
    ...object(node.metadata),
    image_authority_invalidated: true,
    image_authority_invalidation_contract:
      CREATIVE_IMAGE_AUTHORITY_INVALIDATION_CONTRACT,
    image_authority_invalidation_reason: reason,
    image_authority_invalidated_at: new Date().toISOString(),
    release_approved: false,
  };
  if (node.metadata?.image_asset_multiview === true) {
    metadata.image_multiview_qc_sealed = false;
    metadata.image_multiview_parent_stale = true;
  }
  if (text(node.metadata?.derivative_type)) {
    metadata.image_asset_derivative_qc_sealed = false;
    metadata.image_derivative_parent_stale = true;
  }
  if (node.metadata?.material_truth_reference === true) {
    metadata.material_truth_pack_qc_sealed = false;
    metadata.material_measurement_sealed = false;
    metadata.material_truth_source_stale = true;
  }
  if (FOUNDATION_BOUND_CLASSES.has(assetClass(node))) {
    metadata.image_asset_pack_qc_sealed = false;
    metadata.image_foundation_stale = true;
  }
  return metadata;
}

export async function invalidateStaleImageAuthority({
  organization_id,
  creative_project_id,
} = {}) {
  const [nodes, tasks] = await Promise.all([
    CreativeAssetGraphRuntime.list({ organization_id, creative_project_id }),
    ProductionTaskRuntime.list({ organization_id, creative_project_id }),
  ]);

  const invalidated = [];
  for (const node of list(nodes)) {
    if (!node?.id || node.metadata?.image_authority_invalidated === true) continue;
    const reason = staleReason(node, tasks, nodes);
    if (!reason) continue;
    const updated = await AssetGraphRepository.update(node.id, {
      status: "DERIVED",
      review: {
        ...object(node.review),
        approved: false,
        notes:
          "Image authority changed upstream. This asset is revoked until regenerated and re-reviewed.",
      },
      metadata: revocationMetadata(node, reason),
    });
    invalidated.push({
      asset_node_id: node.id,
      reason,
      scope: invalidationScope(node),
      updated,
    });
  }

  const heldTaskIds = [];
  const markedRunningTaskIds = [];
  const terminalInvalidatedTaskIds = [];
  const scopes = invalidated.map((item) => item.scope);
  if (scopes.length) {
    for (const task of list(tasks)) {
      if (!task?.id || !scopes.some((scope) => sameScope(task, scope))) continue;
      const capability = text(task.capability || task.service_code).toLowerCase();
      if (capability.startsWith("ai.image.")) continue;
      const evidence = {
        ...object(task.metadata),
        image_authority_invalidation_contract:
          CREATIVE_IMAGE_AUTHORITY_INVALIDATION_CONTRACT,
        image_authority_invalidated_upstream: true,
        image_authority_invalidated_asset_node_ids:
          invalidated.map((item) => item.asset_node_id),
        image_authority_invalidation_reasons:
          [...new Set(invalidated.map((item) => item.reason))],
      };
      if (["WAITING", "PLANNING", "PLANNED", "READY"].includes(text(task.status).toUpperCase())) {
        await ProductionTaskRuntime.update(task.id, {
          status: "WAITING",
          metadata: evidence,
        });
        heldTaskIds.push(task.id);
      } else if (text(task.status).toUpperCase() === "RUNNING") {
        await ProductionTaskRuntime.update(task.id, {
          metadata: {
            ...evidence,
            image_authority_invalidated_while_running: true,
            downstream_release_must_fail_closed: true,
          },
        });
        markedRunningTaskIds.push(task.id);
      } else if (TERMINAL_TASK_STATUSES.has(text(task.status).toUpperCase())) {
        await ProductionTaskRuntime.update(task.id, {
          metadata: {
            ...evidence,
            prior_output_invalidated_by_upstream_image_authority: true,
          },
        });
        terminalInvalidatedTaskIds.push(task.id);
      }
    }
  }

  return {
    contract: CREATIVE_IMAGE_AUTHORITY_INVALIDATION_CONTRACT,
    invalidated_asset_count: invalidated.length,
    invalidated,
    held_task_ids: heldTaskIds,
    running_task_ids_marked_stale: markedRunningTaskIds,
    terminal_task_ids_marked_stale: terminalInvalidatedTaskIds,
    zero_provider_calls: true,
  };
}

export const CreativeImageAuthorityInvalidationRuntime = Object.freeze({
  contract: CREATIVE_IMAGE_AUTHORITY_INVALIDATION_CONTRACT,
  reconcile: invalidateStaleImageAuthority,
});
