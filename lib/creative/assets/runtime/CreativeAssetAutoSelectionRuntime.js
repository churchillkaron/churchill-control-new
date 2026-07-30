import {
  CreativeAssetsRuntime,
} from "./CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository
from "../graph/repositories/CreativeAssetGraphRepository";

const ROLE_TERMS = {
  BRAND: [
    "logo", "wordmark", "brandmark", "brand mark", "identity", "emblem",
  ],
  PRODUCT: [
    "product", "item", "food", "dish", "meal", "dinner", "lunch", "breakfast",
    "pizza", "burger", "kebab", "pita", "drink", "cocktail", "menu",
  ],
  PLACE: [
    "venue", "location", "interior", "exterior", "restaurant", "bar", "hotel",
    "office", "store", "shop", "stage", "dining room", "atmosphere", "crowd",
  ],
  ACTIVITY: [
    "activity", "event", "game", "pool table", "shuffleboard", "dart", "darts",
    "live music", "performance", "concert", "party", "service", "experience",
  ],
  PEOPLE: [
    "people", "person", "staff", "team", "guest", "customer", "bartender",
    "waiter", "chef", "musician", "singer", "audience",
  ],
};

const DERIVED_TERMS = [
  "campaign", "package", "facebook feed", "instagram feed", "social post",
  "facebook post", "instagram post", "poster", "flyer", "banner", "thumbnail",
  "storyboard", "layout", "mockup", "deliverable", "content pack", "asset pack",
  "keyframe", "key frame", "still frame", "extracted frame", "generated frame",
  "crop", "cropped", "reframe", "reframed", "rendered design", "generated design",
];

const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
  "is", "it", "make", "of", "on", "our", "the", "to", "use", "using", "with",
  "video", "film", "image", "create", "creative", "please",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeJson(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function extension(value) {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  const match = source.match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function sourceText(asset = {}, node = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
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
    node.lineage,
  ].map((value) => typeof value === "string" ? value : safeJson(value))
    .join(" ")
    .toLowerCase();
}

function mediaKind(asset = {}, node = {}) {
  const mime = text(
    node.technical?.mime_type ||
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.mime_type,
  ).toLowerCase();
  const type = text(node.type || asset.asset_type || asset.type).toLowerCase();
  const ext = extension(
    asset.file_name || asset.file_url || asset.image_url || node.url,
  );

  if (mime.startsWith("video/") || type.includes("video") || ["mp4", "mov", "m4v", "webm"].includes(ext)) {
    return "VIDEO";
  }
  if (mime.startsWith("audio/") || type.includes("audio") || ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) {
    return "AUDIO";
  }
  if (mime.startsWith("image/") || type.includes("image") || type.includes("logo") || ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) {
    return "IMAGE";
  }
  return "FILE";
}

function verified(asset = {}, node = {}) {
  const statuses = [
    asset.status,
    asset.analysis?.status,
    asset.metadata?.analysis_status,
    asset.metadata?.verification_status,
    node.status,
    node.review?.status,
    node.metadata?.verification_status,
  ].map((value) => text(value).toUpperCase());

  return Boolean(
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

function usable(asset = {}, node = {}) {
  if (!asset.id || asset.archived === true || asset.disabled === true || asset.deleted_at) {
    return false;
  }
  const statuses = [asset.status, node.status].map((value) => text(value).toUpperCase());
  if (statuses.some((status) => ["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"].includes(status))) {
    return false;
  }
  return Boolean(asset.file_url || asset.image_url || asset.thumbnail_url || node.url || node.storage_path);
}

function originalSource(asset = {}, node = {}) {
  const source = sourceText(asset, node);
  const lineageSource = text(node.lineage?.source).toLowerCase();
  const nodeStatus = text(node.status).toUpperCase();

  return Boolean(
    usable(asset, node) &&
    verified(asset, node) &&
    asset.ai_generated !== true &&
    !text(asset.provider) &&
    !DERIVED_TERMS.some((term) => source.includes(term)) &&
    !["GENERATED", "DERIVED"].includes(nodeStatus) &&
    !["generated", "generation", "derived", "render", "campaign", "template"]
      .some((term) => lineageSource.includes(term)) &&
    !node.parent_asset_node_id,
  );
}

function roles(asset = {}, node = {}) {
  const source = sourceText(asset, node);
  return Object.entries(ROLE_TERMS)
    .filter(([, terms]) => terms.some((term) => source.includes(term)))
    .map(([role]) => role);
}

function intentTokens(value) {
  return [...new Set(
    text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !COMMON_WORDS.has(token)),
  )];
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

function score(candidate, { intent, organization, preferredRole = null } = {}) {
  const source = sourceText(candidate.asset, candidate.node);
  const tokens = intentTokens([
    intent,
    organization?.name,
    organization?.industry,
    organization?.description,
  ].map(text).join(" "));
  const candidateRoles = roles(candidate.asset, candidate.node);
  let result = 0;

  if (candidate.original_source) result += 300;
  if (candidate.verified) result += 150;
  if (preferredRole && candidateRoles.includes(preferredRole)) result += 140;
  if (candidateRoles.includes("BRAND") && /\b(logo|brand|identity)\b/i.test(text(intent))) result += 100;
  if (candidate.media_kind === "VIDEO" && /\b(video|film|reel|motion)\b/i.test(text(intent))) result += 35;
  if (candidate.media_kind === "IMAGE") result += 15;
  result += tokens.filter((token) => source.includes(token)).length * 18;
  result += Math.min(100, Math.max(0, qualityScore(candidate.asset, candidate.node)));
  result += Math.min(20, Number(candidate.asset.usage_count || 0));

  if (candidateRoles.includes("BRAND") && /\bcc[ _-]?logo\b/i.test(source)) result += 250;
  return result;
}

function representativeNodes(nodes = []) {
  const byAsset = new Map();
  for (const node of nodes) {
    const assetId = text(node.creative_asset_id);
    if (!assetId) continue;
    const current = byAsset.get(assetId);
    const nodeRank = (value) => (
      (value.review?.approved === true ? 100 : 0) +
      (value.review?.human_reviewed === true ? 50 : 0) +
      (value.review?.ai_reviewed === true ? 25 : 0) +
      (value.parent_asset_node_id ? -40 : 20) +
      (["APPROVED", "IMPORTED"].includes(text(value.status).toUpperCase()) ? 20 : 0) +
      (text(value.url) || text(value.storage_path) ? 10 : 0)
    );
    if (!current || nodeRank(node) > nodeRank(current)) byAsset.set(assetId, node);
  }
  return byAsset;
}

function roleOrder({ intent, organization } = {}) {
  const context = [intent, organization?.name, organization?.industry]
    .map(text)
    .join(" ")
    .toLowerCase();
  const order = ["BRAND"];

  if (/restaurant|bar|hotel|hospitality|food|dinner|menu|drink|cocktail/.test(context)) {
    order.push("PRODUCT", "PLACE", "ACTIVITY", "PEOPLE");
  } else if (/event|music|concert|game|experience|venue/.test(context)) {
    order.push("ACTIVITY", "PLACE", "PEOPLE", "PRODUCT");
  } else {
    order.push("PRODUCT", "PLACE", "ACTIVITY", "PEOPLE");
  }
  return order;
}

function selectDistinct(candidates, context, maximum = 6) {
  const selected = [];
  const used = new Set();

  for (const role of roleOrder(context)) {
    const match = candidates
      .filter((candidate) => !used.has(candidate.asset.id))
      .filter((candidate) => candidate.roles.includes(role))
      .sort((left, right) => score(right, { ...context, preferredRole: role }) - score(left, { ...context, preferredRole: role }))[0];
    if (!match) continue;
    selected.push({ ...match, selected_role: role });
    used.add(match.asset.id);
    if (selected.length >= maximum) break;
  }

  const minimum = Math.min(3, candidates.length);
  if (selected.length < minimum) {
    const remaining = candidates
      .filter((candidate) => !used.has(candidate.asset.id))
      .sort((left, right) => score(right, context) - score(left, context));
    for (const candidate of remaining) {
      selected.push({ ...candidate, selected_role: candidate.roles[0] || "SOURCE" });
      used.add(candidate.asset.id);
      if (selected.length >= minimum || selected.length >= maximum) break;
    }
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
    const candidates = assets
      .map((asset) => {
        const node = nodeByAsset.get(text(asset.id)) || {};
        return {
          asset,
          node,
          media_kind: mediaKind(asset, node),
          verified: verified(asset, node),
          original_source: originalSource(asset, node),
          roles: roles(asset, node),
        };
      })
      .filter((candidate) => ["IMAGE", "VIDEO"].includes(candidate.media_kind))
      .filter((candidate) => candidate.original_source);

    const selected = selectDistinct(candidates, { intent, organization }, maximum_assets);
    return {
      source: "AUTOMATIC_VERIFIED_ORGANIZATION_ASSET_INTELLIGENCE",
      organization_id,
      intent: text(intent),
      candidate_count: candidates.length,
      selected_asset_ids: selected.map((candidate) => candidate.asset.id),
      selected_assets: selected.map((candidate) => ({
        asset_id: candidate.asset.id,
        asset_node_id: candidate.node.id || null,
        name: candidate.asset.name || candidate.asset.title || candidate.asset.file_name || null,
        file_name: candidate.asset.file_name || null,
        media_kind: candidate.media_kind,
        selected_role: candidate.selected_role,
        roles: candidate.roles,
        verified: candidate.verified,
        original_source: candidate.original_source,
        score: score(candidate, { intent, organization, preferredRole: candidate.selected_role }),
      })),
      assets: selected.map((candidate) => candidate.asset),
    };
  },
};
