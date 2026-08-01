import {
  CreativeAssetAutoSelectionRuntime,
} from "./CreativeAssetAutoSelectionRuntime";
import {
  CreativeAssetsRuntime,
} from "./CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository
from "../graph/repositories/CreativeAssetGraphRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.long-form-asset-selection.v1",
);

const DERIVED_TERMS = [
  "generated", "derived", "derivative", "render", "template", "composition",
  "campaign", "poster", "flyer", "banner", "thumbnail", "storyboard",
  "layout", "mockup", "deliverable", "content pack", "asset pack",
  "keyframe", "key frame", "still frame", "extracted frame", "crop",
  "cropped", "reframe", "reframed", "project_asset_reference",
];

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function durationSeconds(intent = "") {
  const source = normalized(intent);
  const seconds = source.match(
    /\b(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|secs|s)\b/,
  );
  if (seconds) return Number(seconds[1]);
  const minutes = source.match(
    /\b(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins|m)\b/,
  );
  return minutes ? Number(minutes[1]) * 60 : null;
}

function longFormTemporal(intent = "") {
  const source = normalized(intent);
  const duration = durationSeconds(intent);
  return Boolean(
    /\b(video|film|commercial|trailer|motion)\b/.test(source) &&
    duration !== null &&
    duration > 30
  );
}

function originalFileName(asset = {}) {
  return text(
    asset.metadata?.original_file_name ||
    asset.analysis?.storage_evidence?.original_file_name ||
    asset.file_name,
  );
}

function extension(value) {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  return source.match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function mediaKind(asset = {}, node = {}) {
  const mime = text(
    node.technical?.mime_type ||
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type ||
    asset.analysis?.storage_evidence?.mime_type,
  ).toLowerCase();
  const declared = text(node.type || asset.asset_type || asset.type).toLowerCase();
  const ext = extension(
    originalFileName(asset) ||
    asset.file_name ||
    asset.file_url ||
    asset.image_url ||
    node.url,
  );
  if (
    mime.startsWith("video/") ||
    declared.includes("video") ||
    ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext)
  ) return "VIDEO";
  if (
    mime.startsWith("image/") ||
    declared.includes("image") ||
    declared.includes("logo") ||
    ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext)
  ) return "IMAGE";
  return "FILE";
}

function verified(asset = {}, node = {}) {
  const statuses = [
    asset.status,
    asset.review?.status,
    asset.analysis?.status,
    asset.metadata?.analysis_status,
    asset.metadata?.verification_status,
    node.status,
    node.review?.status,
    node.metadata?.verification_status,
  ].map((value) => text(value).toUpperCase());
  return Boolean(
    asset.review?.approved === true ||
    asset.review?.human_reviewed === true ||
    asset.review?.ai_reviewed === true ||
    node.review?.approved === true ||
    node.review?.human_reviewed === true ||
    node.review?.ai_reviewed === true ||
    node.intelligence?.verified === true ||
    asset.metadata?.verified === true ||
    asset.metadata?.asset_verified === true ||
    asset.metadata?.analysis_complete === true ||
    asset.analysis?.verified === true ||
    statuses.some((status) => [
      "APPROVED", "VERIFIED", "COMPLETE", "COMPLETED", "READY", "ACTIVE",
    ].includes(status))
  );
}

function provenance(asset = {}, node = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    originalFileName(asset),
    asset.asset_type,
    asset.metadata,
    asset.analysis,
    node.name,
    node.description,
    node.type,
    node.metadata,
    node.lineage,
  ].map((value) => typeof value === "string" ? value : safeJson(value))
    .join(" ")
    .toLowerCase();
}

function usableOriginal(asset = {}, node = {}) {
  if (!asset.id || asset.archived === true || asset.disabled === true || asset.deleted_at) {
    return false;
  }
  if (!["IMAGE", "VIDEO"].includes(mediaKind(asset, node))) return false;
  if (!verified(asset, node)) return false;
  if (!(asset.file_url || asset.image_url || node.url || node.storage_path)) return false;
  if (!originalFileName(asset) && !asset.file_url && !asset.image_url) return false;
  if (asset.ai_generated === true) return false;

  const status = text(node.status || asset.status).toUpperCase();
  if (["GENERATED", "DERIVED", "REJECTED", "ARCHIVED", "DISABLED"].includes(status)) {
    return false;
  }
  const source = provenance(asset, node);
  return !DERIVED_TERMS.some((term) => source.includes(term));
}

function representativeNodes(nodes = []) {
  const byAsset = new Map();
  for (const node of nodes) {
    const id = text(node.creative_asset_id);
    if (!id || node.parent_asset_node_id) continue;
    const current = byAsset.get(id);
    const score = (value) =>
      (value.review?.approved === true ? 100 : 0) +
      (value.review?.human_reviewed === true ? 50 : 0) +
      (value.review?.ai_reviewed === true ? 25 : 0) +
      (value.url || value.storage_path ? 10 : 0);
    if (!current || score(node) > score(current)) byAsset.set(id, node);
  }
  return byAsset;
}

function semanticScore(asset = {}, node = {}, intent = "") {
  const source = provenance(asset, node);
  const tokens = normalized(intent)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  const tokenScore = tokens.filter((token) => source.includes(token)).length * 10;
  const quality = [
    node.intelligence?.quality_score,
    node.intelligence?.brand_match_score,
    asset.performance_score,
    asset.score,
  ].map(Number).filter(Number.isFinite);
  const qualityScore = quality.length
    ? quality.reduce((sum, value) => sum + value, 0) / quality.length
    : 0;
  const peopleBonus = /\b(person|people|staff|guest|customer|performer|singer|face|portrait)\b/.test(source)
    ? 20
    : 0;
  return tokenScore + Math.min(100, Math.max(0, qualityScore)) + peopleBonus;
}

function selectedRecord(asset = {}, node = {}, intent = "") {
  return {
    asset_id: asset.id,
    asset_node_id: node.id || null,
    name: asset.name || asset.title || asset.file_name || null,
    file_name: asset.file_name || null,
    original_file_name: originalFileName(asset) || null,
    record_source: "ASSET",
    media_kind: mediaKind(asset, node),
    selected_role: "LONG_FORM_SOURCE",
    roles: ["LONG_FORM_SOURCE"],
    verified: true,
    original_source: true,
    source_node_is_root: !node.parent_asset_node_id,
    score: semanticScore(asset, node, intent),
  };
}

function install() {
  if (CreativeAssetAutoSelectionRuntime[INSTALL_FLAG]) return;
  const resolveWithoutExpansion =
    CreativeAssetAutoSelectionRuntime.resolve.bind(
      CreativeAssetAutoSelectionRuntime,
    );

  Object.defineProperty(CreativeAssetAutoSelectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAssetAutoSelectionRuntime.resolve =
    async function resolveWithLongFormCoverage(input = {}) {
      const base = await resolveWithoutExpansion(input);
      if (!longFormTemporal(input.intent)) return base;

      const target = Math.max(10, Math.min(16, Number(input.maximum_assets || 12)));
      if (list(base.assets).length >= target) return base;

      const [assets, nodes] = await Promise.all([
        CreativeAssetsRuntime.list({
          organization_id: input.organization_id,
          limit: 1000,
        }),
        CreativeAssetGraphRepository.listByProject({
          organization_id: input.organization_id,
        }),
      ]);
      const nodeByAsset = representativeNodes(nodes);
      const used = new Set(list(base.selected_asset_ids).map(text));
      const additions = assets
        .map((asset) => ({
          asset,
          node: nodeByAsset.get(text(asset.id)) || {},
        }))
        .filter(({ asset, node }) => !used.has(text(asset.id)) && usableOriginal(asset, node))
        .sort((left, right) =>
          semanticScore(right.asset, right.node, input.intent) -
          semanticScore(left.asset, left.node, input.intent),
        )
        .slice(0, Math.max(0, target - used.size));

      const addedAssets = additions.map((entry) => entry.asset);
      const addedRecords = additions.map((entry) =>
        selectedRecord(entry.asset, entry.node, input.intent),
      );
      return {
        ...base,
        source: "AUTOMATIC_VERIFIED_LONG_FORM_ORGANIZATION_ASSET_INTELLIGENCE",
        selected_asset_ids: [
          ...list(base.selected_asset_ids),
          ...addedAssets.map((asset) => asset.id),
        ],
        selected_assets: [
          ...list(base.selected_assets),
          ...addedRecords,
        ],
        assets: [
          ...list(base.assets),
          ...addedAssets,
        ],
        long_form_asset_expansion: {
          contract: "CREATIVE_LONG_FORM_ASSET_SELECTION_V1",
          target_asset_count: target,
          base_asset_count: list(base.assets).length,
          added_asset_count: additions.length,
          final_asset_count: list(base.assets).length + additions.length,
          verified_original_only: true,
          derived_assets_excluded: true,
        },
      };
    };
}

install();

export const CreativeLongFormAssetSelectionRuntime = {
  installed: true,
  durationSeconds,
  longFormTemporal,
};
