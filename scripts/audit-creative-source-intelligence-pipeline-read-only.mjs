#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function readJson(filePath, label, required = true) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    if (!required) return null;
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

function directionPlan(value = {}) {
  return object(
    value.plan ||
      value.direction?.plan ||
      value.output?.plan ||
      value,
  );
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

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function uniqueAssetIds(values = []) {
  return unique(list(values).map(assetId));
}

function sourceIdsFromDirection(plan = {}) {
  const ids = [];
  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      ids.push(
        shot.primary_source_asset_id,
        shot.primarySourceAssetId,
        shot.generation?.primary_source_asset_id,
        shot.generation?.primarySourceAssetId,
        shot.metadata?.primary_source_asset_id,
        shot.metadata?.primarySourceAssetId,
      );
    }
  }
  return uniqueAssetIds(ids);
}

function semanticEvidence(analysis = {}) {
  const intelligence = object(analysis.intelligence);
  const fields = {
    description: text(analysis.description || intelligence.description),
    summary: text(analysis.summary || intelligence.summary),
    tags: list(analysis.tags || intelligence.tags),
    visible_subjects: list(
      analysis.visible_subjects ||
        analysis.detected_people ||
        analysis.people ||
        intelligence.visible_subjects ||
        intelligence.detected_people,
    ),
    objects: list(
      analysis.objects ||
        analysis.detected_products ||
        analysis.products ||
        intelligence.objects ||
        intelligence.detected_products,
    ),
    activities: list(analysis.activities || intelligence.activities),
    environments: list(
      analysis.environments ||
        analysis.detected_locations ||
        analysis.locations ||
        intelligence.environments ||
        intelligence.detected_locations,
    ),
    visible_text: list(analysis.visible_text || intelligence.visible_text),
    logos: list(analysis.logos || intelligence.logos),
    evidence: list(analysis.evidence || intelligence.evidence),
  };
  const evidenceCount = Object.values(fields).reduce((sum, value) =>
    sum + (Array.isArray(value) ? value.length : value ? 1 : 0),
  0);
  return { fields, evidence_count: evidenceCount };
}

function semanticStatus(asset = {}) {
  const analysis = object(asset.analysis);
  const evidence = semanticEvidence(analysis);
  const status = text(
    analysis.status ||
      analysis.semantic_status ||
      asset.metadata?.semantic_analysis_status,
  ).toUpperCase();
  const technicalPresent = Boolean(
    Object.keys(object(analysis.technical_inspection)).length ||
      Object.keys(object(asset.metadata?.technical)).length ||
      analysis.technical_status ||
      asset.metadata?.inspection_status,
  );

  if (status === "VERIFIED" && evidence.evidence_count > 0) {
    return { status: "SEMANTIC_VERIFIED", ...evidence };
  }
  if (evidence.evidence_count > 0) {
    return { status: "SEMANTIC_PRESENT_NOT_VERIFIED", ...evidence };
  }
  if (status === "UNVERIFIED") {
    return { status: "SEMANTIC_UNVERIFIED", ...evidence };
  }
  if (technicalPresent) {
    return { status: "TECHNICAL_ONLY", ...evidence };
  }
  return { status: "EMPTY", ...evidence };
}

function nodeSemanticEvidence(node = {}) {
  const intelligence = object(node.intelligence);
  const sourceAnalysis = object(
    intelligence.source_asset_analysis ||
      node.metadata?.source_asset_analysis ||
      node.metadata?.source_asset_metadata?.analysis,
  );
  const merged = {
    ...sourceAnalysis,
    intelligence: {
      ...object(sourceAnalysis.intelligence),
      ...intelligence,
    },
  };
  return semanticEvidence(merged);
}

function selectedAnalysisPrice(costEstimate = null) {
  if (!costEstimate) return null;
  const service = list(costEstimate.value.services).find((entry) =>
    text(entry.service_id) === "ai.image.analyze",
  );
  const itemPrices = list(service?.selected?.item_prices);
  const unitPrice = Number(itemPrices[0]?.customer_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return {
    provider: service.selected?.provider || null,
    model: service.selected?.model || null,
    pricing_id: service.selected?.pricing_id || null,
    currency: service.selected?.currency || costEstimate.value.currency || "THB",
    unit: itemPrices[0]?.unit || service.selected?.unit || "request",
    customer_price_per_asset: unitPrice,
  };
}

const direction = readJson(process.argv[2], "DIRECTION");
const costEstimate = process.argv[3]
  ? readJson(process.argv[3], "COST_ESTIMATE", false)
  : null;
const plan = directionPlan(direction.value);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const sourceIds = sourceIdsFromDirection(plan);
if (!sourceIds.length) throw new Error("DIRECTION_PRIMARY_SOURCE_ASSETS_REQUIRED");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const { data: assets, error: assetError } = await supabaseAdmin
  .from("creative_assets")
  .select("*")
  .eq("organization_id", organizationId)
  .in("id", sourceIds);
if (assetError) throw assetError;

const { data: nodes, error: nodeError } = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .in("creative_asset_id", sourceIds)
  .neq("status", "ARCHIVED");
if (nodeError) throw nodeError;

const assetById = new Map(list(assets).map((asset) => [text(asset.id), asset]));
const nodesByAsset = new Map(sourceIds.map((id) => [id, []]));
for (const node of list(nodes)) {
  const id = text(node.creative_asset_id);
  if (nodesByAsset.has(id)) nodesByAsset.get(id).push(node);
}

const results = sourceIds.map((id) => {
  const asset = assetById.get(id) || null;
  const assetNodes = nodesByAsset.get(id) || [];
  const semantic = semanticStatus(asset || {});
  const nodeEvidence = assetNodes.map((node) => ({
    node_id: node.id,
    creative_project_id: node.creative_project_id || null,
    type: node.type || null,
    status: node.status || null,
    lineage_source: node.lineage?.source || null,
    lineage_capability: node.lineage?.capability || null,
    review: node.review || {},
    intelligence_keys: Object.keys(object(node.intelligence)).sort(),
    semantic_evidence_count: nodeSemanticEvidence(node).evidence_count,
    has_source_asset_analysis: Boolean(
      Object.keys(object(
        node.intelligence?.source_asset_analysis ||
          node.metadata?.source_asset_analysis ||
          node.metadata?.source_asset_metadata?.analysis,
      )).length,
    ),
  }));
  const verificationReason = text(
    asset?.analysis?.verification_reason ||
      asset?.analysis?.reason ||
      asset?.metadata?.analysis_reason ||
      asset?.metadata?.inspection_reason,
  );

  return {
    asset_id: id,
    found: Boolean(asset),
    file_name:
      asset?.file_name ||
      asset?.name ||
      asset?.title ||
      asset?.metadata?.original_file_name ||
      null,
    asset_type: asset?.asset_type || null,
    file_url_present: Boolean(
      asset?.file_url || asset?.image_url || asset?.thumbnail_url,
    ),
    metadata_source: asset?.metadata?.source || null,
    metadata_analysis_status: asset?.metadata?.analysis_status || null,
    metadata_inspection_status: asset?.metadata?.inspection_status || null,
    analysis_status: asset?.analysis?.status || null,
    analysis_keys: Object.keys(object(asset?.analysis)).sort(),
    semantic_status: semantic.status,
    semantic_evidence_count: semantic.evidence_count,
    semantic_fields: semantic.fields,
    verification_reason: verificationReason || null,
    created_at: asset?.created_at || null,
    updated_at: asset?.updated_at || null,
    asset_node_count: assetNodes.length,
    asset_nodes: nodeEvidence,
    entered_full_upload_flow:
      asset?.metadata?.source === "CREATIVE_ASSET_UPLOAD",
    provider_semantic_analysis_evidenced:
      semantic.status === "SEMANTIC_VERIFIED",
  };
});

const missingAssets = results.filter((item) => !item.found);
const verifiedAssets = results.filter((item) =>
  item.semantic_status === "SEMANTIC_VERIFIED",
);
const missingSemantic = results.filter((item) =>
  item.found && item.semantic_status !== "SEMANTIC_VERIFIED",
);
const technicalOnly = results.filter((item) =>
  item.semantic_status === "TECHNICAL_ONLY",
);
const bypassedUploadFlow = results.filter((item) =>
  item.found && item.entered_full_upload_flow !== true,
);
const silentlyFailed = results.filter((item) =>
  item.semantic_status === "SEMANTIC_UNVERIFIED" && item.verification_reason,
);
const pricing = selectedAnalysisPrice(costEstimate);
const estimatedRepairCost = pricing
  ? Number((pricing.customer_price_per_asset * missingSemantic.length).toFixed(6))
  : null;

const blockers = [];
for (const item of missingAssets) {
  blockers.push(`SOURCE_ASSET_NOT_FOUND:${item.asset_id}`);
}
for (const item of missingSemantic) {
  blockers.push(
    `SOURCE_ASSET_SEMANTIC_ANALYSIS_REQUIRED:${item.asset_id}:${item.semantic_status}`,
  );
}

const report = {
  contract: "CREATIVE_SOURCE_INTELLIGENCE_PIPELINE_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  direction_file: direction.absolute,
  cost_estimate_file: costEstimate?.absolute || null,
  source_asset_ids: sourceIds,
  summary: {
    source_asset_count: sourceIds.length,
    found_asset_count: results.length - missingAssets.length,
    missing_asset_count: missingAssets.length,
    semantic_verified_count: verifiedAssets.length,
    semantic_analysis_required_count: missingSemantic.length,
    technical_only_count: technicalOnly.length,
    bypassed_full_upload_flow_count: bypassedUploadFlow.length,
    silently_failed_analysis_count: silentlyFailed.length,
    selected_analysis_provider: pricing?.provider || null,
    selected_analysis_model: pricing?.model || null,
    analysis_customer_price_per_asset:
      pricing?.customer_price_per_asset ?? null,
    estimated_semantic_repair_cost: estimatedRepairCost,
    currency: pricing?.currency || null,
  },
  pricing,
  assets: results,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  provider_calls_executed: false,
  database_writes_executed: false,
  wallet_changed: false,
  production_authorized: false,
  publication_authorized: false,
};

const output = path.resolve(
  text(process.env.SOURCE_INTELLIGENCE_PIPELINE_AUDIT_OUTPUT) ||
    "/tmp/churchill-source-intelligence-pipeline-audit.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE SOURCE INTELLIGENCE PIPELINE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`SOURCE_ASSET_COUNT=${report.summary.source_asset_count}`);
console.log(`FOUND_ASSET_COUNT=${report.summary.found_asset_count}`);
console.log(`MISSING_ASSET_COUNT=${report.summary.missing_asset_count}`);
console.log(`SEMANTIC_VERIFIED_COUNT=${report.summary.semantic_verified_count}`);
console.log(`SEMANTIC_ANALYSIS_REQUIRED_COUNT=${report.summary.semantic_analysis_required_count}`);
console.log(`TECHNICAL_ONLY_COUNT=${report.summary.technical_only_count}`);
console.log(`BYPASSED_FULL_UPLOAD_FLOW_COUNT=${report.summary.bypassed_full_upload_flow_count}`);
console.log(`SILENTLY_FAILED_ANALYSIS_COUNT=${report.summary.silently_failed_analysis_count}`);
console.log(`SELECTED_ANALYSIS_PROVIDER=${report.summary.selected_analysis_provider || "UNRESOLVED"}`);
console.log(`SELECTED_ANALYSIS_MODEL=${report.summary.selected_analysis_model || "UNRESOLVED"}`);
console.log(`ANALYSIS_CUSTOMER_PRICE_PER_ASSET=${report.summary.analysis_customer_price_per_asset ?? "UNRESOLVED"}`);
console.log(`ESTIMATED_SEMANTIC_REPAIR_COST=${report.summary.estimated_semantic_repair_cost ?? "UNRESOLVED"}`);
console.log(`CURRENCY=${report.summary.currency || "UNRESOLVED"}`);
console.log(`SOURCE_INTELLIGENCE_READINESS=${report.readiness}`);
console.log(`SOURCE_INTELLIGENCE_BLOCKER_COUNT=${blockers.length}`);
console.log(`SOURCE_INTELLIGENCE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const item of results) {
  console.log([
    "SOURCE_INTELLIGENCE",
    item.asset_id,
    `file=${text(item.file_name).replaceAll("|", "/") || "NONE"}`,
    `type=${item.asset_type || "NONE"}`,
    `source=${item.metadata_source || "NONE"}`,
    `analysis=${item.semantic_status}`,
    `evidence=${item.semantic_evidence_count}`,
    `analysis_status=${item.analysis_status || "NONE"}`,
    `metadata_analysis_status=${item.metadata_analysis_status || "NONE"}`,
    `inspection=${item.metadata_inspection_status || "NONE"}`,
    `nodes=${item.asset_node_count}`,
    `full_upload_flow=${item.entered_full_upload_flow ? "YES" : "NO"}`,
    `reason=${text(item.verification_reason).replaceAll("|", "/") || "NONE"}`,
  ].join("|"));
  for (const node of item.asset_nodes) {
    console.log([
      "SOURCE_NODE_INTELLIGENCE",
      item.asset_id,
      node.node_id,
      `project=${node.creative_project_id || "GLOBAL"}`,
      `type=${node.type || "NONE"}`,
      `status=${node.status || "NONE"}`,
      `lineage=${node.lineage_source || "NONE"}`,
      `capability=${node.lineage_capability || "NONE"}`,
      `evidence=${node.semantic_evidence_count}`,
      `source_analysis=${node.has_source_asset_analysis ? "YES" : "NO"}`,
      `ai_reviewed=${node.review?.ai_reviewed === true ? "YES" : "NO"}`,
      `approved=${node.review?.approved === true ? "YES" : "NO"}`,
    ].join("|"));
  }
}

if (blockers.length) process.exitCode = 2;
