import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_IMAGE_PRODUCTION_PROOF_CONTRACT =
  "CREATIVE_IMAGE_PRODUCTION_PROOF_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}
function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
function assetClass(node = {}) {
  return text(
    node.metadata?.image_asset_class ||
    node.metadata?.image_asset_authority?.asset_class ||
    node.metadata?.derivative_type ||
    (node.metadata?.image_asset_multiview === true ? "MULTIVIEW" : ""),
  ).toUpperCase() || null;
}
function nodeEvidence(node = {}) {
  return {
    asset_node_id: node.id || null,
    asset_class: assetClass(node),
    parent_asset_node_id:
      node.metadata?.parent_image_asset_node_id ||
      node.parent_asset_node_id ||
      null,
    checksum: node.technical?.checksum || null,
    status: node.status || null,
    review_approved: node.review?.approved === true,
    release_approved: node.metadata?.release_approved === true,
    perceptual_qc_sealed:
      node.metadata?.image_asset_perceptual_qc_sealed === true,
    pack_qc_seal_hash:
      node.metadata?.image_asset_pack_qc_seal_hash || null,
    exploration_selection_seal_hash:
      node.metadata?.image_asset_exploration_selection_seal_hash || null,
    multiview_qc_seal_hash:
      node.metadata?.image_multiview_qc_seal_hash || null,
    derivative_qc_task_id:
      node.metadata?.image_asset_derivative_qc_task_id || null,
    material_truth_qc_seal_hash:
      node.metadata?.material_truth_pack_qc_seal_hash || null,
    material_measurement_contract:
      node.metadata?.material_measurement_contract || null,
    source_version_digest:
      node.metadata?.material_truth_source_asset_version_digest ||
      node.metadata?.parent_version_fingerprint ||
      null,
    foundation_authority_digest:
      node.metadata?.image_foundation_authority_digest || null,
    subject_identity_key:
      node.metadata?.subject_identity_key ||
      node.metadata?.identity_profile_id ||
      null,
    threat_identity_key:
      node.metadata?.threat_identity_key || null,
  };
}
function taskEvidence(task = {}) {
  const submission = object(task.output?.provider_submission);
  const poll = object(task.output?.provider_poll);
  const output = object(task.output);
  const usage =
    object(poll.usage).id ? object(poll.usage) :
    object(submission.usage).id ? object(submission.usage) :
    object(output.usage);
  return {
    production_task_id: task.id || null,
    capability: task.capability || task.service_code || null,
    provider:
      submission.provider ||
      poll.provider ||
      output.provider ||
      task.provider_id ||
      null,
    model:
      submission.model ||
      poll.model ||
      output.model ||
      usage.metadata?.model ||
      null,
    provider_job_id:
      output.provider_job_id ||
      submission.provider_job_id ||
      poll.provider_job_id ||
      null,
    usage_id: usage.id || null,
    supplier_cost: finite(
      usage.supplier_cost ??
      poll.pricing?.supplier_cost ??
      submission.pricing?.supplier_cost ??
      task.cost?.actual,
    ),
    customer_price: finite(
      usage.customer_price ??
      poll.pricing?.customer_price ??
      submission.pricing?.customer_price,
    ),
    currency:
      usage.currency ||
      poll.pricing?.currency ||
      submission.pricing?.currency ||
      task.cost?.currency ||
      null,
    provider_execution_claim_id:
      usage.metadata?.provider_execution_claim_id ||
      task.metadata?.provider_execution_claim_id ||
      null,
  };
}
function proofAssetIds({
  provider_references = {},
  production_package = {},
  previsualization_authority = {},
} = {}) {
  return [...new Set([
    ...list(provider_references.source_assets).map((item) => item.asset_node_id),
    production_package.hero?.asset_node_id,
    production_package.continuity?.asset_node_id,
    production_package.performance_reference?.asset_node_id,
    production_package.contact_detail_reference?.asset_node_id,
    ...list(production_package.character_multiview_asset_node_ids),
    ...list(production_package.threat_multiview_asset_node_ids),
    ...list(production_package.material_truth_asset_node_ids),
    previsualization_authority.hero_asset_node_id,
    previsualization_authority.continuity_asset_node_id,
    ...list(previsualization_authority.character_multiview_asset_node_ids),
    ...list(previsualization_authority.threat_multiview_asset_node_ids),
    ...list(previsualization_authority.material_truth_asset_node_ids),
  ].filter(Boolean))];
}

export async function ensureImageProductionProof({
  task = {},
  asset_nodes = [],
  previsualization_authority = {},
  production_package = {},
  shot_ready = {},
  provider_references = {},
  camera_authority = {},
} = {}) {
  if (!task.organization_id || !task.creative_project_id) {
    throw new Error("IMAGE_PRODUCTION_PROOF_SCOPE_REQUIRED");
  }
  if (
    previsualization_authority.passed !== true ||
    production_package.passed !== true ||
    shot_ready.passed !== true
  ) {
    throw new Error("IMAGE_PRODUCTION_PROOF_RELEASE_AUTHORITY_REQUIRED");
  }

  const assetIds = proofAssetIds({
    provider_references,
    production_package,
    previsualization_authority,
  });
  const selectedNodes = assetIds
    .map((id) => list(asset_nodes).find((node) => text(node.id) === text(id)))
    .filter(Boolean);
  if (selectedNodes.length !== assetIds.length) {
    throw new Error("IMAGE_PRODUCTION_PROOF_ASSET_EVIDENCE_INCOMPLETE");
  }

  const sourceTaskIds = [...new Set(
    selectedNodes
      .map((node) => node.production_task_id || node.metadata?.production_task_id)
      .filter(Boolean),
  )];
  const projectTasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const sourceTasks = sourceTaskIds
    .map((id) => projectTasks.find((candidate) => text(candidate.id) === text(id)))
    .filter(Boolean);

  const assetEvidence = selectedNodes
    .map(nodeEvidence)
    .sort((a, b) => text(a.asset_node_id).localeCompare(text(b.asset_node_id)));
  const executionEvidence = sourceTasks
    .map(taskEvidence)
    .sort((a, b) => text(a.production_task_id).localeCompare(text(b.production_task_id)));

  const proofCore = {
    contract: CREATIVE_IMAGE_PRODUCTION_PROOF_CONTRACT,
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id || null,
    scene_id: task.scene_id || task.metadata?.scene_id || null,
    shot_id: task.shot_id || task.metadata?.shot_id || null,
    continuity_group_id:
      production_package.continuity_group_id ||
      previsualization_authority.continuity_group_id ||
      null,
    subject_identity_key:
      production_package.subject_identity_key ||
      previsualization_authority.subject_identity_key ||
      task.metadata?.subject_identity_key ||
      null,
    actor_identity_keys:
      production_package.actor_identity_keys ||
      previsualization_authority.actor_identity_keys ||
      task.metadata?.actor_identity_keys ||
      [],
    threat_identity_key:
      production_package.threat_identity_key ||
      previsualization_authority.threat_identity_key ||
      task.metadata?.threat_identity_key ||
      null,
    foundation_authority_digest:
      production_package.foundation_authority_digest ||
      previsualization_authority.foundation_authority_digest ||
      null,
    previsualization_authority_digest:
      previsualization_authority.previsualization_authority_digest || null,
    production_package_digest:
      production_package.production_package_digest || null,
    shot_ready_digest:
      shot_ready.shot_ready_digest || null,
    camera_authority_hash:
      camera_authority.authority_hash || null,
    provider_reference_manifest: {
      contract: provider_references.contract || null,
      compiled_asset_count:
        Number(provider_references.compiled_asset_count || 0),
      source_asset_node_ids:
        list(provider_references.source_assets)
          .map((item) => item.asset_node_id)
          .filter(Boolean),
      mandatory_roles: list(provider_references.mandatory_roles),
      mandatory_groups: list(provider_references.mandatory_groups),
      omitted_asset_node_ids:
        list(provider_references.omitted_asset_node_ids),
      transport_safe:
        provider_references.provider_transport_safe === true,
    },
    asset_evidence: assetEvidence,
    execution_evidence: executionEvidence,
    zero_unapproved_assets:
      assetEvidence.every((item) =>
        item.review_approved === true &&
        item.release_approved === true
      ),
  };

  if (proofCore.zero_unapproved_assets !== true) {
    throw new Error("IMAGE_PRODUCTION_PROOF_UNAPPROVED_ASSET_PRESENT");
  }

  const proofHash = hash(proofCore);
  const node = createCreativeAssetNode({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_task_id: task.id,
    type: CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT,
    status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
    name:
      "Image Studio Production Proof · " +
      text(proofCore.shot_id || proofCore.scene_id || proofHash.slice(0, 12)),
    description:
      "Immutable content-addressed proof of the exact Image Studio authority package released to downstream motion production.",
    lineage: {
      source: "image_studio_production_proof",
      provider_id: null,
      capability: "creative.image.production-proof",
      generation_version: 1,
    },
    technical: {
      mime_type: "application/vnd.avantiqo.image-production-proof+json",
      checksum: proofHash,
    },
    intelligence: {
      safety_status: "PASS",
      tags: [
        "image-studio-proof",
        "content-addressed",
        "provider-lineage",
        "qc-lineage",
      ],
    },
    cost: {
      currency:
        executionEvidence.find((item) => item.currency)?.currency || null,
      estimated: 0,
      actual: executionEvidence.reduce(
        (sum, item) => sum + (finite(item.supplier_cost) || 0),
        0,
      ),
      saved_by_reuse: 0,
    },
    reuse: {
      reusable: false,
      approved_for_reuse: false,
    },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: true,
      approved_by: "AVANTIQO_IMAGE_PRODUCTION_PROOF",
      notes: "Derived deterministically from already-governed production evidence.",
    },
    metadata: {
      contract: CREATIVE_IMAGE_PRODUCTION_PROOF_CONTRACT,
      image_production_proof_hash: proofHash,
      proof_core: proofCore,
      immutable_content_addressed_record: true,
      provider_calls_performed: false,
      downstream_authority_only: true,
    },
  });

  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    node,
    metadata_key: "image_production_proof_hash",
    metadata_value: proofHash,
  });

  return {
    contract: CREATIVE_IMAGE_PRODUCTION_PROOF_CONTRACT,
    proof_hash: proofHash,
    proof_asset_node_id: result.node.id,
    created: result.created,
    proof: proofCore,
    zero_provider_calls: true,
  };
}

export const CreativeImageProductionProofManifestRuntime = Object.freeze({
  contract: CREATIVE_IMAGE_PRODUCTION_PROOF_CONTRACT,
  ensure: ensureImageProductionProof,
});
