#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";
process.env.CREATIVE_FRESH_DIRECTION_AUTHORIZED = "false";
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "false";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))];
}

function meaningful(value) {
  const source = text(value)
    .replace(/\.(jpg|jpeg|png|webp|heic|avif|mp4|mov|m4v|webm|mkv)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (source.length < 3) return "";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(source)) return "";
  if (/^(img|dsc|photo|video|file|asset|image|clip)[ -]?\d+$/i.test(source)) return "";
  if (/^\d+$/.test(source)) return "";
  return source;
}

function observationLabels(values = []) {
  return list(values).flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") {
      return [text(value)];
    }

    return [
      value?.name,
      value?.label,
      value?.title,
      value?.description,
      value?.summary,
      value?.category,
      value?.type,
      value?.role,
      value?.location,
      value?.subject,
    ].map(text).filter(Boolean);
  });
}

function intelligenceEvidence(value = {}) {
  const source = object(value);
  const nestedAnalysis = object(source.source_asset_analysis);
  const nestedIntelligence = object(nestedAnalysis.intelligence);

  const people = list(
    source.detected_people ||
    source.people ||
    source.persons ||
    source.subjects,
  );
  const products = list(
    source.detected_products ||
    source.products ||
    source.objects,
  );
  const locations = list(
    source.detected_locations ||
    source.locations ||
    source.venues,
  );

  const nestedPeople = list(
    nestedAnalysis.detected_people ||
    nestedAnalysis.people ||
    nestedIntelligence.detected_people ||
    nestedIntelligence.people,
  );
  const nestedProducts = list(
    nestedAnalysis.detected_products ||
    nestedAnalysis.products ||
    nestedAnalysis.objects ||
    nestedIntelligence.detected_products ||
    nestedIntelligence.products ||
    nestedIntelligence.objects,
  );
  const nestedLocations = list(
    nestedAnalysis.detected_locations ||
    nestedAnalysis.locations ||
    nestedIntelligence.detected_locations ||
    nestedIntelligence.locations ||
    nestedIntelligence.venues,
  );

  const evidence = unique([
    source.description,
    source.summary,
    source.caption,
    source.scene_description,
    source.content_description,
    source.tags,
    source.labels,
    source.categories,
    observationLabels(people),
    observationLabels(products),
    observationLabels(locations),
    nestedAnalysis.description,
    nestedAnalysis.summary,
    nestedAnalysis.caption,
    nestedAnalysis.scene_description,
    nestedAnalysis.tags,
    nestedIntelligence.description,
    nestedIntelligence.summary,
    nestedIntelligence.caption,
    nestedIntelligence.scene_description,
    nestedIntelligence.content_description,
    nestedIntelligence.tags,
    nestedIntelligence.labels,
    nestedIntelligence.categories,
    observationLabels(nestedPeople),
    observationLabels(nestedProducts),
    observationLabels(nestedLocations),
  ]).map(meaningful).filter(Boolean);

  return {
    evidence,
    people_count: people.length + nestedPeople.length,
    product_count: products.length + nestedProducts.length,
    location_count: locations.length + nestedLocations.length,
    present: evidence.length > 0,
  };
}

function nodeEvidence(node = {}) {
  const intelligence = intelligenceEvidence(node.intelligence);
  const description = meaningful(node.description);
  const reviewNotes = meaningful(node.review?.notes);
  const evidence = unique([
    description,
    intelligence.evidence,
    reviewNotes && !/materialized from verified creative asset record/i.test(reviewNotes)
      ? reviewNotes
      : null,
  ]);

  return {
    present: evidence.length > 0,
    evidence,
    people_count: intelligence.people_count,
    product_count: intelligence.product_count,
    location_count: intelligence.location_count,
  };
}

function assetUrl(asset = {}) {
  return text(asset.url || asset.file_url || asset.image_url || asset.thumbnail_url);
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = assetUrl(asset).toLowerCase();

  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("audio/") || /audio|music|voice|sfx/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  if (mime.startsWith("image/") || /image|logo|brand/.test(type) || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  return "OTHER";
}

function visualKind(kind) {
  return ["IMAGE", "VIDEO"].includes(text(kind).toUpperCase());
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);

if (!sourceGraphId) throw new Error("SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");

const [
  ProductionGraphRepository,
  CreativeProjectRepository,
  { CreativeAssetsRuntime },
  AssetGraphRepository,
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
]);

const sourceGraph = await ProductionGraphRepository.getById(sourceGraphId);
if (!sourceGraph) {
  throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);
}

const organizationId = text(sourceGraph.organization_id);
const projectId = text(sourceGraph.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const project = await CreativeProjectRepository.getById(projectId);
if (!project) throw new Error(`CREATIVE_PROJECT_NOT_FOUND:${projectId}`);

const [assets, nodes] = await Promise.all([
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    limit: 1000,
  }),
  AssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
]);

const selectedIds = unique(list(project.metadata?.selected_asset_ids));
const assetById = new Map(list(assets).map((asset) => [text(asset.id), asset]));
const nodesByAssetId = new Map();

for (const node of nodes) {
  const assetId = text(
    node.creative_asset_id ||
    node.metadata?.source_creative_asset_id,
  );
  if (!assetId) continue;
  if (!nodesByAssetId.has(assetId)) nodesByAssetId.set(assetId, []);
  nodesByAssetId.get(assetId).push(node);
}

const missingAssetIds = [];
const missingProjectNodeIds = [];
const visualIdsWithoutNodeEvidence = [];
const visualIdsWithNodeEvidence = [];
let nodesWithEvidence = 0;

console.log("============================================================");
console.log("ZERO-COST PROJECT ASSET NODE SEMANTIC EVIDENCE AUDIT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`SELECTED_ASSET_COUNT=${selectedIds.length}`);
console.log(`PROJECT_ASSET_NODE_COUNT=${nodes.length}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("VISION_ANALYSIS_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");

console.log("============================================================");
console.log("PROJECT ASSET NODE EVIDENCE MATRIX");
console.log("============================================================");

for (const [index, assetId] of selectedIds.entries()) {
  const asset = assetById.get(assetId) || null;
  const assetNodes = list(nodesByAssetId.get(assetId));
  const kind = assetKind(asset || assetNodes[0] || {});
  const nodeRows = assetNodes.map((node) => {
    const evidence = nodeEvidence(node);
    if (evidence.present) nodesWithEvidence += 1;
    return {
      node_id: node.id,
      type: text(node.type) || null,
      status: text(node.status) || null,
      parent_asset_node_id: text(node.parent_asset_node_id) || null,
      description_present: Boolean(meaningful(node.description)),
      intelligence_keys: Object.keys(object(node.intelligence)).sort(),
      semantic_evidence_present: evidence.present,
      semantic_evidence_excerpt: evidence.evidence.slice(0, 12),
      observed_people_count: evidence.people_count,
      observed_product_count: evidence.product_count,
      observed_location_count: evidence.location_count,
      approved: node.review?.approved === true,
    };
  });

  const anyNodeEvidence = nodeRows.some((row) => row.semantic_evidence_present);

  if (!asset) missingAssetIds.push(assetId);
  if (!assetNodes.length) missingProjectNodeIds.push(assetId);
  if (visualKind(kind) && anyNodeEvidence) visualIdsWithNodeEvidence.push(assetId);
  if (visualKind(kind) && !anyNodeEvidence) visualIdsWithoutNodeEvidence.push(assetId);

  console.log(`ASSET_${index + 1}=${JSON.stringify({
    asset_id: assetId,
    asset_name: text(
      asset?.name ||
      asset?.title ||
      asset?.file_name ||
      asset?.metadata?.original_file_name,
    ) || null,
    kind,
    asset_record_present: Boolean(asset),
    project_node_count: assetNodes.length,
    any_node_semantic_evidence: anyNodeEvidence,
    nodes: nodeRows,
  })}`);
}

const blockers = unique([
  missingAssetIds.length
    ? `SELECTED_ASSETS_MISSING:${missingAssetIds.join(",")}`
    : null,
  missingProjectNodeIds.length
    ? `SELECTED_ASSET_PROJECT_NODES_MISSING:${missingProjectNodeIds.join(",")}`
    : null,
  visualIdsWithoutNodeEvidence.map((id) =>
    `VISUAL_ASSET_NODE_SEMANTIC_EVIDENCE_MISSING:${id}`,
  ),
]);

console.log("============================================================");
console.log("NODE SEMANTIC EVIDENCE RESULT");
console.log("============================================================");
console.log(`PROJECT_NODES_WITH_SEMANTIC_EVIDENCE=${nodesWithEvidence}`);
console.log(`VISUAL_ASSET_IDS_WITH_NODE_EVIDENCE=${JSON.stringify(visualIdsWithNodeEvidence)}`);
console.log(`VISUAL_ASSET_IDS_WITHOUT_NODE_EVIDENCE=${JSON.stringify(visualIdsWithoutNodeEvidence)}`);
console.log(`MISSING_SELECTED_ASSET_IDS=${JSON.stringify(missingAssetIds)}`);
console.log(`MISSING_PROJECT_NODE_ASSET_IDS=${JSON.stringify(missingProjectNodeIds)}`);
console.log(`NODE_EVIDENCE_RECOVERY_AVAILABLE=${visualIdsWithoutNodeEvidence.length ? "NO" : "YES"}`);
console.log(`VISION_ANALYSIS_REQUIRED=${visualIdsWithoutNodeEvidence.length ? "YES" : "NO"}`);
console.log(`NODE_SEMANTIC_EVIDENCE_READY=${blockers.length ? "NO" : "YES"}`);
console.log(`NODE_SEMANTIC_EVIDENCE_BLOCKER_COUNT=${blockers.length}`);
console.log(`NODE_SEMANTIC_EVIDENCE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("OLD_GRAPH_REUSED=NO");
console.log("OLD_TASKS_REUSED=NO");
console.log("NEW_DIRECTION_CREATED=NO");
console.log("NEW_GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("BUDGET_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

if (blockers.length) process.exitCode = 2;
