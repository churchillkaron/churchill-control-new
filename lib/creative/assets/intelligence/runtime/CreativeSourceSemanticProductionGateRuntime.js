import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  assertCreativeSourceAssetsSemanticReady,
} from "@/lib/creative/assets/intelligence/CreativeAssetSemanticEvidenceRuntime";
import {
  assertCreativeSourceShotEvidenceReady,
} from "@/lib/creative/assets/intelligence/runtime/CreativeSourceShotEvidenceRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const INSTALL_KEY = Symbol.for(
  "avantiqo.creative.source-semantic-production-gate.v2",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function uniqueAssetIds(values = []) {
  return [...new Set(
    values
      .flat(Infinity)
      .map(assetId)
      .filter(Boolean),
  )];
}

function shotSourceAssetIds(shot = {}) {
  return uniqueAssetIds([
    shot.primary_source_asset_id,
    shot.primarySourceAssetId,
    shot.generation?.primary_source_asset_id,
    shot.generation?.primarySourceAssetId,
    shot.metadata?.primary_source_asset_id,
    shot.metadata?.primarySourceAssetId,
    list(shot.reference_asset_ids),
    list(shot.referenceAssetIds),
    list(shot.identity_requirements?.reference_asset_ids),
    list(shot.identity_requirements?.referenceAssetIds),
    list(shot.performance_contract?.identity_reference_asset_ids),
    list(shot.performance_contract?.identityReferenceAssetIds),
  ]);
}

function requiredSourceAssetIds(input = {}) {
  return uniqueAssetIds(list(input.shots).flatMap(shotSourceAssetIds));
}

async function loadRawSourceAssets({ organizationId, assetIds }) {
  if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
  if (!assetIds.length) {
    throw new Error("CREATIVE_PRODUCTION_SOURCE_ASSETS_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", assetIds);

  if (error) throw error;
  return data || [];
}

export async function assertProductionSourceSemanticEvidence(input = {}) {
  const organizationId = text(
    input.organization_id || input.organizationId,
  );
  const shots = list(input.shots);
  const assetIds = requiredSourceAssetIds(input);
  const assets = await loadRawSourceAssets({ organizationId, assetIds });
  const semantic = assertCreativeSourceAssetsSemanticReady({
    assets,
    required_asset_ids: assetIds,
  });
  const sourceShot = assertCreativeSourceShotEvidenceReady({
    shots,
    assets,
    minimum_confidence: 60,
  });

  return {
    contract: "CREATIVE_SOURCE_SEMANTIC_PRODUCTION_GATE_V2",
    organization_id: organizationId,
    required_asset_ids: assetIds,
    semantic,
    source_shot: sourceShot,
  };
}

function install() {
  if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

  const basePreview = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  const basePlan = ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);

  ProductionGraphRuntime.preview = async function previewWithSemanticGate(input = {}) {
    await assertProductionSourceSemanticEvidence(input);
    return basePreview(input);
  };

  ProductionGraphRuntime.plan = async function planWithSemanticGate(input = {}) {
    await assertProductionSourceSemanticEvidence(input);
    return basePlan(input);
  };

  const installation = Object.freeze({
    contract: "CREATIVE_SOURCE_SEMANTIC_PRODUCTION_GATE_V2",
    installed: true,
    production_graph_preview_guarded: true,
    production_graph_materialization_guarded: true,
    raw_source_records_required: true,
    semantic_source_verification_required: true,
    structured_source_shot_evidence_required: true,
    minimum_structured_evidence_confidence: 60,
    free_form_substring_matching_disallowed: true,
    legacy_node_approval_is_not_semantic_evidence: true,
  });
  globalThis[INSTALL_KEY] = installation;
  return installation;
}

export const CreativeSourceSemanticProductionGateRuntime = Object.freeze({
  contract: "CREATIVE_SOURCE_SEMANTIC_PRODUCTION_GATE_V2",
  requiredSourceAssetIds,
  assert: assertProductionSourceSemanticEvidence,
  installation: install(),
});
