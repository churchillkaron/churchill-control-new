#!/usr/bin/env node

import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function env(name, fallback = null) {
  return text(process.env[name]) || fallback;
}

function yes(name) {
  return env(name, "NO").toUpperCase() === "YES";
}

function csv(value) {
  return text(value).split(",").map(text).filter(Boolean);
}

function corpus(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function isCole(value) {
  const source = corpus(value);
  return source.includes("cole ley") || /(^|[^a-z])cole([^a-z]|$)/i.test(source);
}

function isImageNode(node = {}) {
  const mime = text(node.technical?.mime_type).toLowerCase();
  return node.type === "IMAGE" || mime.startsWith("image/");
}

function isImageAsset(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const url = text(asset.file_url || asset.image_url || asset.url).toLowerCase();
  return (
    mime.startsWith("image/") ||
    type.includes("image") ||
    type === "person" ||
    /\.(png|jpe?g|webp)(\?|$)/.test(url)
  );
}

function isLogo(value = {}) {
  const source = corpus(value);
  return text(value.type).toUpperCase() === "LOGO" ||
    text(value.asset_type).toLowerCase() === "logo" ||
    source.includes("cole ley logo") ||
    source.includes("asset_type\":\"logo");
}

function referenceIdsFromShot(shot = {}) {
  return [
    ...list(shot.reference_assets),
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.generation?.reference_assets),
    ...list(shot.generation?.reference_asset_ids),
  ].flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (!entry || typeof entry !== "object") return [];
    return [
      entry.id,
      entry.asset_id,
      entry.assetId,
      entry.node_id,
      entry.nodeId,
      entry.creative_asset_id,
    ].map(text).filter(Boolean);
  });
}

function scoreNode({ node, explicitIds, shotReferenceIds, selectedAssetIds, projectId }) {
  if (!node?.url || !isImageNode(node) || isLogo(node)) return -10000;
  if (["ARCHIVED", "REJECTED"].includes(node.status)) return -10000;
  if (
    node.creative_project_id &&
    String(node.creative_project_id) !== String(projectId)
  ) return -10000;

  let score = 0;
  if (explicitIds.has(text(node.id))) score += 2000;
  if (explicitIds.has(text(node.creative_asset_id))) score += 2000;
  if (shotReferenceIds.has(text(node.id))) score += 1200;
  if (shotReferenceIds.has(text(node.creative_asset_id))) score += 1200;
  if (selectedAssetIds.has(text(node.creative_asset_id))) score += 500;
  if (String(node.creative_project_id || "") === String(projectId)) score += 200;
  if (isCole(node)) score += 800;
  if (list(node.intelligence?.detected_people).some(isCole)) score += 800;
  if (node.status === "APPROVED" || node.review?.approved === true) score += 100;
  return score;
}

function scoreAsset({ asset, explicitIds, shotReferenceIds, selectedAssetIds }) {
  if (!isImageAsset(asset) || isLogo(asset)) return -10000;
  if (asset.archived === true) return -10000;

  let score = 0;
  if (explicitIds.has(text(asset.id))) score += 2000;
  if (shotReferenceIds.has(text(asset.id))) score += 1200;
  if (selectedAssetIds.has(text(asset.id))) score += 500;
  if (isCole(asset)) score += 800;
  if (list(asset.analysis?.visible_inventory?.people).some(isCole)) score += 800;
  if (isCole(asset.analysis?.identity)) score += 800;
  return score;
}

const PROJECT_ID = env(
  "COLE_LEY_PROJECT_ID",
  "6fbac0e8-ab00-44be-9b26-94bf25f28c1e",
);
const EXECUTE = yes("COLE_IDENTITY_BOOTSTRAP_EXECUTE");
const explicitIds = new Set(csv(env("COLE_LEY_IDENTITY_REFERENCE_IDS", "")));

const ProjectRepository = await import(
  "@/lib/creative/projects/repositories/CreativeProjectRepository"
);
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);
const { CreativeAssetsRuntime } = await import(
  "@/lib/creative/assets/runtime/CreativeAssetsRuntime"
);
const { ShotRuntime } = await import(
  "@/lib/creative/shots/runtime/ShotRuntime"
);
const {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} = await import(
  "@/lib/creative/assets/graph/documents/CreativeAssetNode"
);

const project = await ProjectRepository.getById(PROJECT_ID);
if (!project) throw new Error(`COLE_PROJECT_NOT_FOUND:${PROJECT_ID}`);
const organizationId = env("CREATIVE_SMOKE_ORGANIZATION_ID", project.organization_id);
if (String(organizationId) !== String(project.organization_id)) {
  throw new Error("COLE_PROJECT_ORGANIZATION_MISMATCH");
}

const [organizationNodes, projectAssets, shots] = await Promise.all([
  AssetGraphRepository.listByProject({ organization_id: organizationId }),
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
    limit: 1000,
  }),
  ShotRuntime.list({
    organization_id: organizationId,
    creative_project_id: PROJECT_ID,
  }),
]);

const selectedAssetIds = new Set(
  list(project.metadata?.selected_asset_ids).map(text).filter(Boolean),
);
const coleShots = shots.filter((shot) => isCole({
  title: shot.title,
  purpose: shot.purpose,
  subject: shot.subject,
  action: shot.action,
  performance: shot.performance,
  actors: shot.actors,
  dialogue: shot.dialogue,
  metadata: shot.metadata,
}));
const shotReferenceIds = new Set(
  coleShots.flatMap(referenceIdsFromShot).map(text).filter(Boolean),
);

const rankedNodes = organizationNodes
  .map((node) => ({
    kind: "NODE",
    id: node.id,
    asset_id: node.creative_asset_id || null,
    name: node.name || node.description || "",
    url: node.url,
    node,
    score: scoreNode({
      node,
      explicitIds,
      shotReferenceIds,
      selectedAssetIds,
      projectId: PROJECT_ID,
    }),
  }))
  .filter((entry) => entry.score > 0)
  .sort((left, right) => right.score - left.score);

const nodesByCreativeAssetId = new Map(
  organizationNodes
    .filter((node) => node.creative_asset_id)
    .map((node) => [String(node.creative_asset_id), node]),
);
const rankedAssets = projectAssets
  .filter((asset) => !nodesByCreativeAssetId.has(String(asset.id)))
  .map((asset) => ({
    kind: "ASSET",
    id: asset.id,
    asset_id: asset.id,
    name: asset.name || asset.file_name || asset.title || "",
    url: asset.file_url || asset.image_url || asset.url || null,
    asset,
    score: scoreAsset({
      asset,
      explicitIds,
      shotReferenceIds,
      selectedAssetIds,
    }),
  }))
  .filter((entry) => entry.url && entry.score > 0)
  .sort((left, right) => right.score - left.score);

const ranked = [...rankedNodes, ...rankedAssets]
  .sort((left, right) => right.score - left.score);
const minimumScore = explicitIds.size ? 2000 : shotReferenceIds.size ? 1200 : 500;
const chosen = ranked.filter((entry) => entry.score >= minimumScore).slice(0, 4);

console.log("============================================================");
console.log("COLE IDENTITY REFERENCE BOOTSTRAP");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`COLE_SHOT_COUNT=${coleShots.length}`);
console.log(`SHOT_REFERENCE_ID_COUNT=${shotReferenceIds.size}`);
console.log(`PROJECT_SELECTED_ASSET_COUNT=${selectedAssetIds.size}`);
console.log(`EXPLICIT_REFERENCE_ID_COUNT=${explicitIds.size}`);
console.log(`CANDIDATE_COUNT=${ranked.length}`);
for (const entry of ranked.slice(0, 20)) {
  console.log([
    "IDENTITY_CANDIDATE",
    entry.kind,
    entry.id,
    entry.asset_id || "",
    entry.score,
    text(entry.name).replace(/\|/g, "/"),
  ].join("|"));
}
console.log(`CHOSEN_COUNT=${chosen.length}`);
console.log(`EXECUTE=${EXECUTE ? "YES" : "NO"}`);

if (!chosen.length) {
  throw new Error(
    "COLE_IDENTITY_REFERENCE_NOT_RESOLVED: set COLE_LEY_IDENTITY_REFERENCE_IDS to the correct image asset or node IDs shown above",
  );
}

if (!EXECUTE) {
  for (const entry of chosen) {
    console.log(`WOULD_LINK_COLE_REFERENCE=${entry.kind}|${entry.id}|${entry.name}`);
  }
  console.log("DRY_RUN_COMPLETE=YES");
  process.exit(0);
}

const linked = [];
for (const entry of chosen) {
  let node;
  if (entry.kind === "NODE") {
    node = entry.node;
    node = await AssetGraphRepository.update(node.id, {
      creative_project_id: node.creative_project_id || PROJECT_ID,
      name: isCole(node) ? node.name : `Cole Ley identity reference — ${node.name || node.id}`,
      metadata: {
        ...(node.metadata || {}),
        identity_subject: "Cole Ley",
        identity_reference_for: ["Cole Ley"],
        selected_for_project: true,
        selected_for_project_at:
          node.metadata?.selected_for_project_at || new Date().toISOString(),
        cole_identity_reference_bootstrapped_at: new Date().toISOString(),
      },
    });
  } else {
    const asset = entry.asset;
    const technical = object(asset.analysis?.technical_inspection);
    node = await AssetGraphRepository.create(createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: PROJECT_ID,
      creative_asset_id: asset.id,
      type: CREATIVE_ASSET_NODE_TYPES.IMAGE,
      status: CREATIVE_ASSET_NODE_STATUS.IMPORTED,
      name: `Cole Ley identity reference — ${entry.name || asset.id}`,
      description: asset.description || "Cole Ley identity reference",
      url: entry.url,
      lineage: {
        source: "creative_asset_identity_bootstrap",
        capability: "creative.asset.identity_reference",
        generation_version: 1,
      },
      technical: {
        ...technical,
        mime_type:
          technical.mime_type ||
          asset.metadata?.mime_type ||
          asset.analysis?.mime_type ||
          null,
      },
      intelligence: {
        ...(asset.analysis || {}),
        tags: [...new Set([...list(asset.tags), "Cole Ley", "identity reference"])],
      },
      review: {
        ai_reviewed: Boolean(Object.keys(asset.analysis || {}).length),
        human_reviewed: false,
        approved: false,
        notes: "Linked as a project identity reference from the user's selected Cole assets; final generated footage still requires human identity review.",
      },
      metadata: {
        identity_subject: "Cole Ley",
        identity_reference_for: ["Cole Ley"],
        selected_for_project: true,
        source_creative_asset_id: asset.id,
        cole_identity_reference_bootstrapped_at: new Date().toISOString(),
      },
    }));
  }
  linked.push(node);
  console.log(`COLE_IDENTITY_REFERENCE_LINKED=${node.id}|asset:${node.creative_asset_id || ""}|${node.name}`);
}

console.log(`LINKED_COUNT=${linked.length}`);
console.log("COLE_IDENTITY_BOOTSTRAP_STATUS=PASS");
