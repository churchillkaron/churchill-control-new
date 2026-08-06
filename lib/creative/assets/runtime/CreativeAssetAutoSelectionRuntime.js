import {
  CreativeAssetsRuntime,
} from "./CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository
from "../graph/repositories/CreativeAssetGraphRepository";

const DELIVERY_TERMS = [
  "campaign design", "campaign package", "content package", "social feed",
  "social post", "poster", "flyer", "banner", "thumbnail", "storyboard",
  "layout", "mockup", "deliverable", "content pack", "asset pack", "keyframe",
  "key frame", "still frame", "extracted frame", "generated frame", "crop",
  "cropped", "reframe", "reframed", "rendered design", "generated design",
];

const GENERATED_PROVENANCE_TERMS = [
  "generated", "generation", "derived", "derivative", "render", "template",
  "composition", "project_asset_reference",
];

const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
  "is", "it", "make", "of", "on", "our", "the", "to", "use", "using", "with",
  "create", "creative", "please",
]);

const FACET_PATHS = [
  ["asset", "asset_type"],
  ["asset", "metadata", "asset_role"],
  ["asset", "metadata", "role"],
  ["asset", "metadata", "category"],
  ["asset", "metadata", "purpose"],
  ["asset", "metadata", "source_type"],
  ["asset", "metadata", "brand_asset_type"],
  ["asset", "analysis", "semantic_roles"],
  ["asset", "analysis", "roles"],
  ["asset", "analysis", "categories"],
  ["node", "type"],
  ["node", "metadata", "asset_role"],
  ["node", "metadata", "role"],
  ["node", "metadata", "category"],
  ["node", "metadata", "purpose"],
  ["node", "metadata", "source_type"],
  ["node", "intelligence", "semantic_roles"],
  ["node", "intelligence", "roles"],
];

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

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function flattenText(value, output = [], seen = new Set(), depth = 0) {
  if (depth > 12 || value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) output.push(rendered);
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, output, seen, depth + 1);
    return output;
  }
  for (const child of Object.values(value)) {
    flattenText(child, output, seen, depth + 1);
  }
  return output;
}

function unique(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of list(values).flat(Infinity)) {
    const rendered = text(value);
    const key = rendered.toLowerCase();
    if (!rendered || seen.has(key)) continue;
    seen.add(key);
    output.push(rendered);
  }
  return output;
}

function extension(value) {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  const match = source.match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function originalFileName(asset = {}) {
  return text(
    asset.metadata?.original_file_name ||
    asset.analysis?.storage_evidence?.original_file_name ||
    asset.file_name,
  );
}

function semanticText(asset = {}, node = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    originalFileName(asset),
    asset.description,
    asset.asset_type,
    asset.tags,
    asset.analysis,
    asset.metadata,
    node.name,
    node.description,
    node.type,
    node.intelligence,
    node.metadata,
    node.review,
  ].map((value) => typeof value === "string" ? value : safeJson(value))
    .join(" ")
    .toLowerCase();
}

function provenanceText(asset = {}, node = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    originalFileName(asset),
    asset.asset_type,
    asset.metadata?.asset_role,
    asset.metadata?.role,
    asset.metadata?.category,
    asset.metadata?.purpose,
    asset.metadata?.source_type,
    asset.metadata?.generation_type,
    asset.metadata?.brand_asset_type,
    node.name,
    node.type,
    node.metadata?.asset_role,
    node.metadata?.role,
    node.metadata?.category,
    node.metadata?.purpose,
    node.metadata?.source_type,
    node.metadata?.generation_type,
    node.lineage?.source,
    node.lineage?.capability,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
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
    mime.startsWith("audio/") ||
    declared.includes("audio") ||
    ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)
  ) return "AUDIO";

  if (
    mime.startsWith("image/") ||
    declared.includes("image") ||
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
    ].includes(status)),
  );
}

function usableAssetRecord(asset = {}, node = {}) {
  if (!asset.id || asset.archived === true || asset.disabled === true || asset.deleted_at) {
    return false;
  }
  const status = text(asset.status).toUpperCase();
  if (["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"].includes(status)) {
    return false;
  }
  return Boolean(
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    node.url ||
    node.storage_path,
  );
}

function generatedAssetRecord(asset = {}) {
  const generation = [
    asset.asset_type,
    asset.metadata?.source_type,
    asset.metadata?.generation_type,
  ].map(text).join(" ").toLowerCase();
  return Boolean(
    asset.ai_generated === true ||
    GENERATED_PROVENANCE_TERMS.some((term) => generation.includes(term)),
  );
}

function originalSource(asset = {}, node = {}) {
  const provenance = provenanceText(asset, node);
  const nodeStatus = text(node.status).toUpperCase();
  const lineage = [
    node.lineage?.source,
    node.lineage?.capability,
    node.metadata?.source_type,
    node.metadata?.generation_type,
  ].map(text).join(" ").toLowerCase();
  const hasOriginalIdentity = Boolean(
    originalFileName(asset) ||
    asset.file_url ||
    asset.image_url,
  );

  return Boolean(
    usableAssetRecord(asset, node) &&
    verified(asset, node) &&
    ["IMAGE", "VIDEO"].includes(mediaKind(asset, node)) &&
    hasOriginalIdentity &&
    !generatedAssetRecord(asset) &&
    !DELIVERY_TERMS.some((term) => provenance.includes(term)) &&
    !["GENERATED", "DERIVED"].includes(nodeStatus) &&
    !GENERATED_PROVENANCE_TERMS.some((term) => lineage.includes(term)),
  );
}

function valueAt(source, path) {
  let current = source;
  for (const key of path) {
    if (current === null || current === undefined) return null;
    current = current[key];
  }
  return current;
}

function semanticFacets(asset = {}, node = {}) {
  const source = { asset, node };
  return unique(
    FACET_PATHS.flatMap((path) => flattenText(valueAt(source, path))),
  ).slice(0, 24);
}

function intentTokens(value) {
  return [...new Set(
    flattenText(value)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !COMMON_WORDS.has(token)),
  )];
}

function candidateTokens(candidate = {}) {
  return intentTokens({
    semantic: semanticText(candidate.asset, candidate.node),
    facets: candidate.facets,
  });
}

function contextTokens({ intent, organization } = {}) {
  return intentTokens({
    intent,
    organization: {
      name: organization?.name,
      description: organization?.description,
      summary: organization?.summary,
      tags: organization?.tags,
      profile: organization?.profile,
      business_context:
        organization?.business_context ||
        organization?.metadata?.business_context ||
        organization?.metadata?.organization_context,
    },
  });
}

function qualityScore(asset = {}, node = {}) {
  const values = [
    node.intelligence?.quality_score,
    node.intelligence?.brand_match_score,
    node.intelligence?.reuse_score,
    asset.performance_score,
    asset.score,
  ].map(Number).filter(Number.isFinite);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function declaredPriority(asset = {}, node = {}) {
  const values = [
    asset.metadata?.selection_priority,
    asset.metadata?.priority,
    node.metadata?.selection_priority,
    node.intelligence?.selection_priority,
  ].map(Number).filter(Number.isFinite);
  const numeric = values.length ? Math.max(...values) : 0;
  const primary = Boolean(
    asset.metadata?.primary === true ||
    asset.metadata?.primary_asset === true ||
    node.metadata?.primary === true ||
    node.intelligence?.primary === true,
  );
  return Math.min(100, Math.max(0, numeric)) + (primary ? 50 : 0);
}

function intersectionCount(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function similarity(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function score(candidate, context = {}) {
  const requested = contextTokens(context);
  const available = candidate.tokens;
  const overlap = intersectionCount(requested, available);
  const rootNode = !candidate.node.parent_asset_node_id;
  let result = 0;

  if (candidate.original_source) result += 300;
  if (candidate.verified) result += 150;
  if (rootNode) result += 40;
  result += overlap * 24;
  result += Math.min(100, Math.max(0, qualityScore(candidate.asset, candidate.node)));
  result += declaredPriority(candidate.asset, candidate.node);
  result += Math.min(20, Number(candidate.asset.usage_count || 0));

  return result;
}

function representativeNodes(nodes = []) {
  const byAsset = new Map();
  for (const node of nodes) {
    const assetId = text(node.creative_asset_id);
    if (!assetId) continue;
    const current = byAsset.get(assetId);
    const nodeRank = (value) => {
      const status = text(value.status).toUpperCase();
      const lineage = text(value.lineage?.source).toLowerCase();
      return (
        (value.parent_asset_node_id ? -1000 : 500) +
        (["GENERATED", "DERIVED", "REJECTED", "ARCHIVED"].includes(status) ? -1000 : 0) +
        (lineage.includes("project_asset_reference") ? -800 : 0) +
        (value.review?.approved === true ? 100 : 0) +
        (value.review?.human_reviewed === true ? 50 : 0) +
        (value.review?.ai_reviewed === true ? 25 : 0) +
        (["APPROVED", "IMPORTED"].includes(status) ? 20 : 0) +
        (text(value.url) || text(value.storage_path) ? 10 : 0)
      );
    };
    if (!current || nodeRank(node) > nodeRank(current)) byAsset.set(assetId, node);
  }
  return byAsset;
}

function selectDistinct(candidates, context, maximum = 6) {
  const selected = [];
  const remaining = [...candidates];
  const limit = Math.max(0, Math.min(Number(maximum) || 0, candidates.length));

  while (selected.length < limit && remaining.length) {
    const ranked = remaining.map((candidate) => {
      const base = score(candidate, context);
      const duplicateRisk = selected.length
        ? Math.max(...selected.map((prior) => similarity(candidate.tokens, prior.tokens)))
        : 0;
      return {
        candidate,
        base,
        duplicateRisk,
        selectionScore: base - duplicateRisk * 140,
      };
    }).sort((left, right) =>
      right.selectionScore - left.selectionScore ||
      right.base - left.base ||
      text(left.candidate.asset.id).localeCompare(text(right.candidate.asset.id)),
    );

    const winner = ranked[0]?.candidate;
    if (!winner) break;
    selected.push(winner);
    const index = remaining.findIndex((candidate) => candidate.asset.id === winner.asset.id);
    if (index >= 0) remaining.splice(index, 1);
  }

  return selected;
}

export const CreativeAssetAutoSelectionRuntime = {
  async resolve({
    organization_id,
    organization = {},
    intent = "",
    maximum_assets = 6,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");

    const [assets, nodes] = await Promise.all([
      CreativeAssetsRuntime.list({ organization_id, limit: 1000 }),
      CreativeAssetGraphRepository.listByProject({ organization_id }),
    ]);
    const nodeByAsset = representativeNodes(nodes);
    const evaluated = assets.map((asset) => {
      const node = nodeByAsset.get(text(asset.id)) || {};
      const facets = semanticFacets(asset, node);
      const candidate = {
        asset,
        node,
        media_kind: mediaKind(asset, node),
        verified: verified(asset, node),
        original_source: originalSource(asset, node),
        facets,
      };
      return {
        ...candidate,
        tokens: candidateTokens(candidate),
      };
    });
    const visual = evaluated.filter((candidate) =>
      ["IMAGE", "VIDEO"].includes(candidate.media_kind),
    );
    const verifiedVisual = visual.filter((candidate) => candidate.verified);
    const candidates = verifiedVisual.filter((candidate) => candidate.original_source);
    const context = { intent, organization };
    const selected = selectDistinct(candidates, context, maximum_assets);

    return {
      contract: "DYNAMIC_EVIDENCE_WEIGHTED_ASSET_SELECTION_V1",
      source: "AUTOMATIC_VERIFIED_ORGANIZATION_ASSET_INTELLIGENCE",
      organization_id,
      intent: text(intent),
      scanned_asset_count: assets.length,
      scanned_asset_node_count: nodes.length,
      visual_asset_count: visual.length,
      verified_visual_asset_count: verifiedVisual.length,
      candidate_count: candidates.length,
      selected_asset_ids: selected.map((candidate) => candidate.asset.id),
      selected_assets: selected.map((candidate) => ({
        asset_id: candidate.asset.id,
        asset_node_id: candidate.node.id || null,
        name:
          candidate.asset.name ||
          candidate.asset.title ||
          candidate.asset.file_name ||
          null,
        file_name: candidate.asset.file_name || null,
        original_file_name: originalFileName(candidate.asset) || null,
        record_source: "ASSET",
        media_kind: candidate.media_kind,
        selected_role: candidate.facets[0] || "SOURCE",
        roles: candidate.facets,
        verified: candidate.verified,
        original_source: candidate.original_source,
        source_node_is_root: !candidate.node.parent_asset_node_id,
        score: score(candidate, context),
      })),
      assets: selected.map((candidate) => candidate.asset),
    };
  },
};
