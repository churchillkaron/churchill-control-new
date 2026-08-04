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
  if (/pdf|document|presentation|spreadsheet/.test(`${mime} ${type}`)) {
    return "DOCUMENT";
  }
  return "OTHER";
}

function assetName(asset = {}) {
  return text(
    asset.name ||
    asset.title ||
    asset.file_name ||
    asset.metadata?.original_file_name ||
    asset.id,
  );
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

function analysisEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(
    analysis.intelligence ||
    asset.intelligence ||
    asset.metadata?.intelligence,
  );

  const people = list(
    analysis.detected_people ||
    analysis.people ||
    analysis.persons ||
    analysis.subjects ||
    intelligence.detected_people ||
    intelligence.people ||
    intelligence.persons ||
    intelligence.subjects ||
    asset.metadata?.people,
  );
  const products = list(
    analysis.detected_products ||
    analysis.products ||
    analysis.objects ||
    intelligence.detected_products ||
    intelligence.products ||
    intelligence.objects ||
    asset.metadata?.products,
  );
  const locations = list(
    analysis.detected_locations ||
    analysis.locations ||
    intelligence.detected_locations ||
    intelligence.locations ||
    intelligence.venues ||
    asset.metadata?.locations,
  );

  const descriptive = unique([
    analysis.description,
    analysis.summary,
    analysis.caption,
    analysis.scene_description,
    intelligence.description,
    intelligence.summary,
    intelligence.caption,
    intelligence.scene_description,
    intelligence.content_description,
    analysis.tags,
    intelligence.tags,
    intelligence.labels,
    intelligence.categories,
    observationLabels(people),
    observationLabels(products),
    observationLabels(locations),
  ]);

  return {
    present: descriptive.some((value) => text(value).length >= 3),
    descriptive,
    people_count: people.length,
    product_count: products.length,
    location_count: locations.length,
  };
}

const SPECIALIZED_ROLES = new Set([
  "PERSON_IDENTITY_REFERENCE",
  "PRODUCT_IDENTITY_REFERENCE",
  "BRAND_MARK_REFERENCE",
  "LOCATION_REFERENCE",
  "STYLE_REFERENCE",
]);

function visualKind(kind) {
  return ["IMAGE", "VIDEO"].includes(text(kind).toUpperCase());
}

function specializedRoles(roles = []) {
  return list(roles)
    .map((role) => text(role).toUpperCase())
    .filter((role) => SPECIALIZED_ROLES.has(role));
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);

if (!sourceGraphId) throw new Error("SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");

await import(
  "@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetSemanticCoverageRuntime"
);

const [
  ProductionGraphRepository,
  CreativeProjectRepository,
  { CreativeBriefRuntime },
  { CreativeAssetsRuntime },
  { CreativeUniversalAssetIntelligenceRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime"),
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

const missionId = text(
  project.creative_mission_id ||
  sourceGraph.creative_mission_id,
);

const [briefs, assets] = await Promise.all([
  CreativeBriefRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId || undefined,
  }),
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId || undefined,
    limit: 1000,
  }),
]);

const brief = briefs[0] || {};
const selectedIds = unique(list(project.metadata?.selected_asset_ids));
const assetById = new Map(list(assets).map((asset) => [text(asset.id), asset]));
const selectedAssets = selectedIds.map((id) => assetById.get(id)).filter(Boolean);
const selectedIdSet = new Set(selectedIds);
const directionSupportAssets = list(assets).filter((asset) =>
  !selectedIdSet.has(text(asset.id)) &&
  asset.metadata?.direction_support_asset === true &&
  asset.metadata?.read_only_projection === true
);
const directionAssets = [
  ...selectedAssets,
  ...directionSupportAssets,
];
const directionSupportAssetIds = directionSupportAssets
  .map((asset) => text(asset.id))
  .filter(Boolean);
const missingSelectedIds = selectedIds.filter((id) => !assetById.has(id));

const intelligence = CreativeUniversalAssetIntelligenceRuntime.analyze({
  project,
  brief,
  assets: directionAssets,
});

const manifestById = new Map(
  list(intelligence.asset_manifest).map((entry) => [text(entry.asset_id), entry]),
);

const missingManifestIds = selectedIds.filter((id) => !manifestById.has(id));
const missingDirectionSupportManifestIds =
  directionSupportAssetIds.filter(
    (id) => !manifestById.has(id),
  );
const nameOnlyVisualIds = [];
const fallbackOnlyVisualIds = [];
const uncoveredVisualIds = [];
const roleCounts = {};

console.log("============================================================");
console.log("ZERO-COST CREATIVE ASSET SEMANTIC ROLE MATRIX");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId || "NONE"}`);
console.log(`SELECTED_ASSET_COUNT=${selectedIds.length}`);
console.log(`SELECTED_ASSET_RECORD_COUNT=${selectedAssets.length}`);
console.log(`DIRECTION_SUPPORT_ASSET_COUNT=${directionSupportAssets.length}`);
console.log(`DIRECTION_SUPPORT_ASSET_IDS=${JSON.stringify(directionSupportAssetIds)}`);
console.log(`DIRECTION_ASSET_COUNT=${directionAssets.length}`);
console.log(`ASSET_MANIFEST_COUNT=${list(intelligence.asset_manifest).length}`);
console.log(`INTELLIGENCE_CONTRACT=${text(intelligence.contract) || "NONE"}`);
console.log(`SEMANTIC_COVERAGE_CONTRACT=${text(intelligence.semantic_coverage?.contract) || "NONE"}`);
console.log(`SUBJECT_PROFILE_COUNT=${list(intelligence.subject_profiles).length}`);
console.log(`PERSON_PROFILE_COUNT=${list(intelligence.person_profiles).length}`);
console.log(`PRODUCT_PROFILE_COUNT=${list(intelligence.product_profiles).length}`);
console.log(`LOCATION_PROFILE_COUNT=${list(intelligence.location_profiles).length}`);
console.log(`BRAND_MARK_PROFILE_COUNT=${list(intelligence.brand_mark_profiles).length}`);
console.log(`AUDIO_SOURCE_COUNT=${list(intelligence.audio_sources).length}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("FRESH_DIRECTION_AUTHORIZED=NO");
console.log("PROVIDER_EXECUTION_AUTHORIZED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");

console.log("============================================================");
console.log("ASSET ROLE MATRIX");
console.log("============================================================");

for (const [index, id] of selectedIds.entries()) {
  const asset = assetById.get(id) || {};
  const entry = manifestById.get(id) || {};
  const kind = text(entry.kind || assetKind(asset)).toUpperCase();
  const roles = unique(list(entry.roles).map((role) => text(role).toUpperCase()));
  const evidence = analysisEvidence(asset);
  const specialized = specializedRoles(roles);
  const subjectFallback = roles.includes("SUBJECT_REFERENCE");
  const covered = specialized.length > 0 || subjectFallback;
  const nameOnly = visualKind(kind) && covered && !evidence.present;
  const fallbackOnly = visualKind(kind) && subjectFallback && specialized.length === 0;

  if (visualKind(kind) && !covered) uncoveredVisualIds.push(id);
  if (nameOnly) nameOnlyVisualIds.push(id);
  if (fallbackOnly) fallbackOnlyVisualIds.push(id);

  for (const role of roles) {
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }

  console.log(`ASSET_${index + 1}=${JSON.stringify({
    id,
    name: assetName(asset),
    kind,
    roles,
    specialized_roles: specialized,
    subject_fallback: subjectFallback,
    fallback_only: fallbackOnly,
    analysis_evidence_present: evidence.present,
    analysis_evidence_excerpt: evidence.descriptive.slice(0, 10),
    observed_people_count: evidence.people_count,
    observed_product_count: evidence.product_count,
    observed_location_count: evidence.location_count,
    runtime_semantic_evidence: entry.semantic_evidence || null,
    analysis_status: text(
      asset.analysis_status ||
      asset.analysis?.status ||
      asset.metadata?.analysis_status,
    ) || null,
  })}`);
}

const blockers = unique([
  list(intelligence.blocking_issues),
  missingSelectedIds.length
    ? `SELECTED_ASSETS_MISSING:${missingSelectedIds.join(",")}`
    : null,
  missingManifestIds.length
    ? `ASSET_MANIFEST_ENTRIES_MISSING:${missingManifestIds.join(",")}`
    : null,
  missingDirectionSupportManifestIds.length
    ? `DIRECTION_SUPPORT_MANIFEST_ENTRIES_MISSING:${missingDirectionSupportManifestIds.join(",")}`
    : null,
  directionSupportAssets.length &&
  list(intelligence.audio_sources).length < 1
    ? "PRIMARY_SOUNDTRACK_NOT_VISIBLE_TO_DIRECTION_INTELLIGENCE"
    : null,
  uncoveredVisualIds.map((id) =>
    `VISUAL_ASSET_SEMANTIC_CLASSIFICATION_REQUIRED:${id}`,
  ),
  nameOnlyVisualIds.map((id) =>
    `VISUAL_ASSET_ANALYSIS_EVIDENCE_REQUIRED:${id}`,
  ),
]);

console.log("============================================================");
console.log("SEMANTIC ROLE MATRIX RESULT");
console.log("============================================================");
console.log(`ROLE_COUNTS=${JSON.stringify(roleCounts)}`);
console.log(`VISUAL_ASSET_COUNT=${list(intelligence.asset_manifest).filter((entry) => visualKind(entry.kind)).length}`);
console.log(`SEMANTICALLY_COVERED_VISUAL_ASSET_COUNT=${Number(intelligence.semantic_coverage?.semantically_covered_visual_asset_count || 0)}`);
console.log(`UNCLASSIFIED_VISUAL_ASSET_IDS=${JSON.stringify(uncoveredVisualIds)}`);
console.log(`NAME_ONLY_VISUAL_ASSET_IDS=${JSON.stringify(nameOnlyVisualIds)}`);
console.log(`FALLBACK_ONLY_VISUAL_ASSET_IDS=${JSON.stringify(fallbackOnlyVisualIds)}`);
console.log(`MISSING_SELECTED_ASSET_IDS=${JSON.stringify(missingSelectedIds)}`);
console.log(`MISSING_MANIFEST_ASSET_IDS=${JSON.stringify(missingManifestIds)}`);
console.log(`MISSING_DIRECTION_SUPPORT_MANIFEST_ASSET_IDS=${JSON.stringify(missingDirectionSupportManifestIds)}`);
console.log(`SEMANTIC_ROLE_MATRIX_READY=${blockers.length ? "NO" : "YES"}`);
console.log(`SEMANTIC_ROLE_MATRIX_BLOCKER_COUNT=${blockers.length}`);
console.log(`SEMANTIC_ROLE_MATRIX_BLOCKERS=${JSON.stringify(blockers)}`);
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
