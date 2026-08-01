import { CreativeAssetAutoSelectionRuntime } from "./CreativeAssetAutoSelectionRuntime";
import { CreativeAssetsRuntime } from "./CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository from "../graph/repositories/CreativeAssetGraphRepository";

const FLAG = Symbol.for("avantiqo.creative.long-form-asset-selection.v2");
const DERIVED = [
  "derived", "derivative", "project_asset_reference", "generated_frame",
  "extracted_frame", "keyframe", "storyboard", "crop", "cropped",
  "reframe", "reframed", "thumbnail", "preview_render",
];
const INTERMEDIATE = [
  "poster", "flyer", "banner", "thumbnail", "storyboard", "layout",
  "mockup", "keyframe", "key frame", "still frame", "extracted frame",
  "crop", "cropped", "reframe", "reframed", "contact sheet",
];
const MASTER = [
  "approved", "master", "final", "release", "delivery master",
  "brand motion", "logo animation", "motion logo", "animated logo",
  "brand ident", "opener", "closer", "stinger",
];
const ROLES = {
  BRAND_MOTION: ["logo animation", "motion logo", "animated logo", "brand motion", "brand ident", "logo reveal", "opener", "closer", "stinger"],
  BRAND_MARK: ["logo", "wordmark", "brand mark", "brandmark", "emblem", "identity"],
  LOCATION: ["venue", "location", "interior", "exterior", "entrance", "building", "restaurant", "bar", "hotel", "store", "office", "stage", "room"],
  PEOPLE: ["people", "person", "staff", "team", "guest", "customer", "crowd", "bartender", "waiter", "chef", "performer", "singer", "musician", "audience", "face", "portrait"],
  PRODUCT: ["product", "food", "dish", "meal", "dinner", "lunch", "breakfast", "drink", "cocktail", "beer", "wine", "menu", "plate", "serving"],
  ACTIVITY: ["activity", "game", "pool table", "shuffleboard", "dart", "darts", "service", "dining", "celebration", "conversation", "social"],
  PERFORMANCE: ["live music", "performance", "concert", "band", "singer", "musician", "stage", "dance", "dancing", "audience"],
  ATMOSPHERE: ["atmosphere", "ambience", "night", "evening", "crowd", "party", "social", "energy", "experience", "lighting"],
};
const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "use", "using", "with", "create", "film", "video", "brand", "world", "class", "produce"]);

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function json(value) { try { return JSON.stringify(value || {}); } catch { return ""; } }
function norm(value) { return text(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }

function durationFromIntent(intent = "") {
  const source = norm(intent);
  const seconds = source.match(/\b(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|secs|s)\b/);
  if (seconds) return Number(seconds[1]);
  const minutes = source.match(/\b(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins|m)\b/);
  return minutes ? Number(minutes[1]) * 60 : null;
}

function isLongForm(intent = "") {
  const duration = durationFromIntent(intent);
  return /\b(video|film|commercial|trailer|motion)\b/.test(norm(intent)) && duration !== null && duration > 30;
}

function fileName(asset = {}) {
  return text(asset.metadata?.original_file_name || asset.analysis?.storage_evidence?.original_file_name || asset.file_name);
}

function extension(value) {
  return text(value).toLowerCase().split(/[?#]/)[0].match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function kind(asset = {}, node = {}) {
  const mime = text(node.technical?.mime_type || asset.mime_type || asset.metadata?.mime_type || asset.analysis?.technical_inspection?.mime_type || asset.analysis?.storage_evidence?.mime_type).toLowerCase();
  const declared = text(node.type || asset.asset_type || asset.type).toLowerCase();
  const ext = extension(fileName(asset) || asset.file_url || asset.image_url || node.url);
  if (mime.startsWith("video/") || declared.includes("video") || ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext)) return "VIDEO";
  if (mime.startsWith("image/") || declared.includes("image") || declared.includes("logo") || ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext)) return "IMAGE";
  return "FILE";
}

function duration(asset = {}, node = {}) {
  return finite(node.technical?.duration_seconds || node.metadata?.duration_seconds || asset.duration_seconds || asset.metadata?.duration_seconds || asset.analysis?.duration_seconds || asset.analysis?.technical?.duration_seconds || asset.analysis?.technical_inspection?.duration_seconds) || 0;
}

function verified(asset = {}, node = {}) {
  const statuses = [asset.status, asset.review?.status, asset.analysis?.status, asset.metadata?.analysis_status, asset.metadata?.verification_status, node.status, node.review?.status, node.metadata?.verification_status].map((value) => text(value).toUpperCase());
  return Boolean(
    asset.review?.approved === true || asset.review?.human_reviewed === true || asset.review?.ai_reviewed === true ||
    node.review?.approved === true || node.review?.human_reviewed === true || node.review?.ai_reviewed === true ||
    node.intelligence?.verified === true || asset.metadata?.verified === true || asset.metadata?.asset_verified === true ||
    asset.metadata?.analysis_complete === true || asset.analysis?.verified === true ||
    statuses.some((status) => ["APPROVED", "VERIFIED", "COMPLETE", "COMPLETED", "READY", "ACTIVE"].includes(status))
  );
}

function description(asset = {}, node = {}) {
  return [asset.name, asset.title, asset.file_name, fileName(asset), asset.description, asset.asset_type, asset.tags, asset.analysis, node.name, node.description, node.type, node.intelligence]
    .map((value) => typeof value === "string" ? value : json(value)).join(" ").toLowerCase();
}

function provenance(asset = {}, node = {}) {
  return [asset.asset_type, asset.metadata?.asset_role, asset.metadata?.role, asset.metadata?.category, asset.metadata?.purpose, asset.metadata?.source_type, asset.metadata?.generation_type, asset.metadata?.workflow_kind, asset.metadata?.render_role, node.type, node.status, node.metadata?.asset_role, node.metadata?.role, node.metadata?.category, node.metadata?.purpose, node.metadata?.source_type, node.metadata?.generation_type, node.metadata?.workflow_kind, node.metadata?.render_role, node.lineage?.source, node.lineage?.capability]
    .map(text).filter(Boolean).join(" ").toLowerCase();
}

function identity(asset = {}, node = {}) {
  return [asset.name, asset.title, asset.file_name, fileName(asset), asset.metadata?.asset_role, asset.metadata?.role, asset.metadata?.purpose, node.name, node.description, node.metadata?.asset_role, node.metadata?.role, node.metadata?.purpose]
    .map(text).filter(Boolean).join(" ").toLowerCase();
}

function approvedMaster(asset = {}, node = {}) {
  const status = text(node.status || asset.status).toUpperCase();
  const approved = asset.review?.approved === true || asset.review?.human_reviewed === true || node.review?.approved === true || node.review?.human_reviewed === true || ["APPROVED", "VERIFIED", "READY", "COMPLETE", "COMPLETED"].includes(status);
  const source = `${identity(asset, node)} ${provenance(asset, node)}`;
  return approved && MASTER.some((term) => source.includes(term));
}

function derived(asset = {}, node = {}) {
  if (node.parent_asset_node_id) return true;
  const status = text(node.status || asset.status).toUpperCase();
  if (["DERIVED", "GENERATED_FRAME", "KEYFRAME", "CROP", "REFRAME"].includes(status)) return true;
  const source = provenance(asset, node);
  return DERIVED.some((term) => source.includes(term));
}

function sourceClass(asset = {}, node = {}) {
  if (!asset.id || asset.archived === true || asset.disabled === true || asset.deleted_at) return null;
  const media = kind(asset, node);
  if (!["IMAGE", "VIDEO"].includes(media) || !verified(asset, node)) return null;
  if (!(asset.file_url || asset.image_url || node.url || node.storage_path)) return null;
  const status = text(node.status || asset.status).toUpperCase();
  if (["REJECTED", "ARCHIVED", "DISABLED", "FAILED", "DELETED"].includes(status)) return null;
  const master = approvedMaster(asset, node);
  if (derived(asset, node)) return media === "VIDEO" && master ? "APPROVED_MASTER_MOTION" : null;
  if (INTERMEDIATE.some((term) => identity(asset, node).includes(term)) && !master) return null;
  return media === "VIDEO" && master ? "APPROVED_MASTER_MOTION" : "VERIFIED_SOURCE";
}

function representativeNodes(nodes = []) {
  const map = new Map();
  const rank = (node) => (node.parent_asset_node_id ? -500 : 500) + (node.review?.approved === true ? 200 : 0) + (node.review?.human_reviewed === true ? 100 : 0) + (node.review?.ai_reviewed === true ? 25 : 0) + (node.url || node.storage_path ? 10 : 0);
  for (const node of nodes) {
    const id = text(node.creative_asset_id);
    if (!id) continue;
    const current = map.get(id);
    if (!current || rank(node) > rank(current)) map.set(id, node);
  }
  return map;
}

function inferRoles(asset = {}, node = {}, classification = "") {
  const source = description(asset, node);
  const result = Object.entries(ROLES).filter(([, terms]) => terms.some((term) => source.includes(term))).map(([role]) => role);
  if (classification === "APPROVED_MASTER_MOTION" && result.includes("BRAND_MARK") && !result.includes("BRAND_MOTION")) result.unshift("BRAND_MOTION");
  return [...new Set(result)];
}

function quality(asset = {}, node = {}) {
  const values = [node.intelligence?.quality_score, node.intelligence?.brand_match_score, node.intelligence?.reuse_score, asset.performance_score, asset.score].map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function tokens(intent = "") {
  return [...new Set(norm(intent).split(/\s+/).filter((token) => token.length > 2 && !STOP.has(token)))];
}

function score(candidate, intent = "") {
  const source = description(candidate.asset, candidate.node);
  let value = tokens(intent).filter((token) => source.includes(token)).length * 12;
  value += Math.min(100, Math.max(0, quality(candidate.asset, candidate.node)));
  value += candidate.media_kind === "VIDEO" ? 90 : 15;
  value += Math.min(120, candidate.duration_seconds * 2);
  value += candidate.source_class === "APPROVED_MASTER_MOTION" ? 160 : 0;
  value += candidate.roles.includes("BRAND_MOTION") ? 220 : 0;
  value += candidate.roles.includes("PEOPLE") ? 25 : 0;
  value += candidate.roles.includes("PERFORMANCE") ? 25 : 0;
  return value;
}

function roleOrder(intent = "") {
  const source = norm(intent);
  const result = ["BRAND_MOTION", "BRAND_MARK", "LOCATION", "PEOPLE"];
  if (/\b(food|restaurant|bar|hotel|hospitality|dinner|drink|menu)\b/.test(source)) result.push("PRODUCT", "ACTIVITY", "PERFORMANCE", "ATMOSPHERE");
  else if (/\b(event|music|concert|performance|experience)\b/.test(source)) result.push("PERFORMANCE", "ACTIVITY", "ATMOSPHERE", "PRODUCT");
  else result.push("PRODUCT", "ACTIVITY", "PERFORMANCE", "ATMOSPHERE");
  return [...new Set(result)];
}

function select(candidates = [], intent = "", target = 12) {
  const ranked = [...candidates].sort((a, b) => score(b, intent) - score(a, intent));
  const selected = [];
  const used = new Set();
  const take = (candidate, role) => {
    if (!candidate || used.has(candidate.asset.id) || selected.length >= target) return;
    selected.push({ ...candidate, selected_role: role || candidate.roles[0] || "LONG_FORM_SOURCE" });
    used.add(candidate.asset.id);
  };
  for (const role of roleOrder(intent)) take(ranked.find((candidate) => !used.has(candidate.asset.id) && candidate.roles.includes(role)), role);
  const videos = ranked.filter((candidate) => candidate.media_kind === "VIDEO");
  const requiredVideos = Math.min(videos.length, Math.max(2, Math.ceil(target / 3)));
  for (const candidate of videos) {
    if (selected.filter((item) => item.media_kind === "VIDEO").length >= requiredVideos) break;
    take(candidate, candidate.roles[0] || "VIDEO_SOURCE");
  }
  for (const candidate of ranked) take(candidate);
  return selected;
}

function record(candidate, intent) {
  return {
    asset_id: candidate.asset.id,
    asset_node_id: candidate.node.id || null,
    name: candidate.asset.name || candidate.asset.title || candidate.asset.file_name || null,
    file_name: candidate.asset.file_name || null,
    original_file_name: fileName(candidate.asset) || null,
    record_source: "ASSET",
    media_kind: candidate.media_kind,
    duration_seconds: candidate.duration_seconds,
    selected_role: candidate.selected_role,
    roles: candidate.roles,
    verified: true,
    source_class: candidate.source_class,
    original_source: candidate.source_class === "VERIFIED_SOURCE",
    approved_master_motion: candidate.source_class === "APPROVED_MASTER_MOTION",
    direct_use_policy: candidate.source_class === "APPROVED_MASTER_MOTION" ? "IMMUTABLE_DIRECT_COMPOSITE" : "SOURCE_OR_FACTUAL_REFERENCE",
    source_node_is_root: !candidate.node.parent_asset_node_id,
    score: score(candidate, intent),
  };
}

function install() {
  if (CreativeAssetAutoSelectionRuntime[FLAG]) return;
  const originalResolve = CreativeAssetAutoSelectionRuntime.resolve.bind(CreativeAssetAutoSelectionRuntime);
  Object.defineProperty(CreativeAssetAutoSelectionRuntime, FLAG, { value: true, enumerable: false, configurable: false });
  CreativeAssetAutoSelectionRuntime.resolve = async function resolveLongForm(input = {}) {
    const base = await originalResolve(input);
    if (!isLongForm(input.intent)) return base;
    const target = Math.max(10, Math.min(16, Math.ceil((durationFromIntent(input.intent) || 60) / 5)));
    const [assets, nodes] = await Promise.all([
      CreativeAssetsRuntime.list({ organization_id: input.organization_id, limit: 1000 }),
      CreativeAssetGraphRepository.listByProject({ organization_id: input.organization_id }),
    ]);
    const nodeMap = representativeNodes(nodes);
    const candidates = assets.map((asset) => {
      const node = nodeMap.get(text(asset.id)) || {};
      const classification = sourceClass(asset, node);
      return { asset, node, source_class: classification, media_kind: kind(asset, node), duration_seconds: duration(asset, node), roles: inferRoles(asset, node, classification) };
    }).filter((candidate) => Boolean(candidate.source_class));
    const selected = select(candidates, input.intent, target);
    const minimum = Math.min(8, target);
    if (selected.length < minimum) throw new Error(`CREATIVE_LONG_FORM_SOURCE_COVERAGE_INSUFFICIENT:selected=${selected.length};required=${minimum};candidates=${candidates.length}`);
    const records = selected.map((candidate) => record(candidate, input.intent));
    return {
      ...base,
      source: "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE",
      selected_asset_ids: selected.map((candidate) => candidate.asset.id),
      selected_assets: records,
      assets: selected.map((candidate) => candidate.asset),
      long_form_asset_expansion: {
        contract: "CREATIVE_LONG_FORM_ASSET_SELECTION_V2",
        target_asset_count: target,
        base_asset_count: list(base.assets).length,
        candidate_count: candidates.length,
        final_asset_count: selected.length,
        selected_video_count: selected.filter((item) => item.media_kind === "VIDEO").length,
        selected_image_count: selected.filter((item) => item.media_kind === "IMAGE").length,
        selected_video_duration_seconds: Number(selected.filter((item) => item.media_kind === "VIDEO").reduce((sum, item) => sum + item.duration_seconds, 0).toFixed(3)),
        approved_master_motion_count: selected.filter((item) => item.source_class === "APPROVED_MASTER_MOTION").length,
        selected_roles: [...new Set(records.flatMap((item) => item.roles))],
        verified_sources_only: true,
        intermediate_derivatives_excluded: true,
        approved_master_motion_allowed_as_immutable_composite: true,
        filename_or_asset_id_override_used: false,
      },
    };
  };
}

install();

export const CreativeLongFormAssetSelectionRuntimeV2 = {
  installed: true,
  durationSeconds: durationFromIntent,
  longFormTemporal: isLongForm,
};
