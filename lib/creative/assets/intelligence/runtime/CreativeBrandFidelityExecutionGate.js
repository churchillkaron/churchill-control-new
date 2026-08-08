import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";
import {
  CreativeBrandFidelityRuntime,
} from "./CreativeBrandFidelityRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.brand-fidelity.execution-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function brandRule(task = {}, contract) {
  const rules = list(
    task.input?.requirements?.brand_rules ||
    task.metadata?.requirements?.brand_rules,
  );
  return rules.find((rule) => rule?.contract === contract) || null;
}

function generatedVisualTask(task = {}) {
  const type = upper(task.type);
  const capability = text(task.capability || task.service_code).toLowerCase();
  return ["GENERATE_IMAGE", "GENERATE_VIDEO"].includes(type) ||
    capability.includes("image.generate") ||
    capability.includes("video.generate");
}

function storyLineage(task = {}) {
  return object(
    task.input?.story_lineage ||
    task.input?.requirements?.story_lineage ||
    task.metadata?.story_lineage,
  );
}

function primarySource(task = {}) {
  return text(
    task.input?.primary_source_asset_id ||
    task.input?.generation?.primary_source_asset_id ||
    task.input?.requirements?.primary_source_asset_id ||
    task.metadata?.verified_primary_source_asset_id,
  );
}

async function enforce(task = {}) {
  if (!generatedVisualTask(task)) return task;

  const contracts = CreativeBrandFidelityRuntime.contracts;
  const fidelity = brandRule(task, contracts.brand_fidelity);
  if (!fidelity || fidelity.required !== true) return task;

  const truth = brandRule(task, contracts.brand_truth);
  if (
    !truth ||
    text(truth.brand_truth_hash) !== text(fidelity.brand_truth_hash)
  ) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_TRUTH_REQUIRED:${task.id || "unknown"}`,
    );
  }

  const lineage = storyLineage(task);
  for (const key of [
    "research_report_id",
    "research_identity",
    "selected_concept_hash",
    "story_contract_hash",
    "master_plan_hash",
  ]) {
    if (!text(lineage[key])) {
      throw new Error(
        `CREATIVE_BRAND_FIDELITY_STORY_LINEAGE_REQUIRED:${task.id || "unknown"}:${key}`,
      );
    }
  }
  if (
    text(lineage.research_report_id) !== text(fidelity.research_report_id) ||
    text(lineage.research_identity) !== text(fidelity.research_identity)
  ) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_RESEARCH_LINEAGE_MISMATCH:${task.id || "unknown"}`,
    );
  }

  const primary = primarySource(task);
  const trusted = new Set(
    list(fidelity.trusted_primary_source_asset_ids).map(text).filter(Boolean),
  );
  if (!primary || !trusted.has(primary)) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_TRUSTED_PRIMARY_SOURCE_REQUIRED:${task.id || "unknown"}`,
    );
  }

  const asset = await CreativeAssetsRuntime.get(primary);
  if (!asset || text(asset.organization_id) !== text(task.organization_id)) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_PRIMARY_ASSET_NOT_FOUND:${task.id || "unknown"}:${primary}`,
    );
  }
  const provenance = CreativeBrandFidelityRuntime.classify(asset);
  if (!provenance.trusted_for_brand_fidelity_primary) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_PRIMARY_ASSET_UNTRUSTED:${task.id || "unknown"}:${primary}`,
    );
  }

  const scope = object(task.input?.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_ASSET_SCOPE_REQUIRED:${task.id || "unknown"}`,
    );
  }
  if (
    text(scope.primary_source_asset_id) !== primary ||
    !list(scope.creative_asset_ids).map(text).includes(primary)
  ) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_ASSET_SCOPE_MISMATCH:${task.id || "unknown"}:${primary}`,
    );
  }

  const perceptualReviewNodeId = text(
    task.input?.requirements?.perceptual_review_node_id ||
    task.input?.provider_parameters?.perceptual_review_node_id ||
    task.input?.generation?.provider_parameters?.perceptual_review_node_id ||
    task.metadata?.perceptual_review_node_id,
  );
  if (
    fidelity.post_generation_brand_review_required === true &&
    !perceptualReviewNodeId
  ) {
    throw new Error(
      `CREATIVE_BRAND_FIDELITY_POST_GENERATION_REVIEW_REQUIRED:${task.id || "unknown"}`,
    );
  }

  return ProductionTaskRuntime.update(task.id, {
    metadata: {
      ...object(task.metadata),
      brand_fidelity_execution_gate: {
        contract: "CREATIVE_BRAND_FIDELITY_EXECUTION_GATE_V1",
        passed: true,
        brand_truth_hash: truth.brand_truth_hash,
        provenance_hash: fidelity.provenance_hash,
        research_report_id: fidelity.research_report_id,
        primary_source_asset_id: primary,
        primary_source_classification: provenance.classification,
        asset_scope_hash: scope.scope_hash,
        perceptual_review_node_id: perceptualReviewNodeId || null,
      },
    },
  });
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatchWithoutBrandFidelity = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithBrandFidelityGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const verified = await enforce(task);
    return dispatchWithoutBrandFidelity(verified.id);
  };
}

export const CreativeBrandFidelityExecutionGate = Object.freeze({
  installed: true,
  enforce,
});
