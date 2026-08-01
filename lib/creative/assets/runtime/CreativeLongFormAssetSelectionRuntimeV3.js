import { CreativeAssetAutoSelectionRuntime } from "./CreativeAssetAutoSelectionRuntime";
import { CreativeAssetsRuntime } from "./CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository from "../graph/repositories/CreativeAssetGraphRepository";

const FLAG = Symbol.for("avantiqo.creative.long-form-asset-selection.v3");

const INTERMEDIATE_TERMS = [
  "campaign design", "campaign layout", "campaign creative", "content package",
  "content pack", "asset pack", "facebook feed", "instagram feed",
  "social feed", "social post", "facebook post", "instagram post",
  "poster", "flyer", "banner", "thumbnail", "storyboard", "layout",
  "mockup", "keyframe", "key frame", "still frame", "extracted frame",
  "generated frame", "contact sheet", "crop", "cropped", "reframe",
  "reframed", "preview render", "template composition",
];

const DERIVED_TERMS = [
  "derived", "derivative", "project_asset_reference", "generated_frame",
  "extracted_frame", "keyframe", "storyboard", "crop", "cropped",
  "reframe", "reframed", "thumbnail", "preview_render",
];

const MASTER_MOTION_TERMS = [
  "approved master", "delivery master", "final master", "release master",
  "brand motion", "logo animation", "motion logo", "animated logo",
  "logo reveal", "brand ident", "opener", "closer", "stinger",
];

const ROLE_TERMS = {
  BRAND_MOTION: [
    "brand motion", "logo animation", "motion logo", "animated logo",
    "logo reveal", "brand ident", "opener", "closer", "stinger",
  ],
  BRAND_MARK: [
    "logo", "wordmark", "brand mark", "brandmark", "emblem",
  ],
  LOCATION: [
    "venue", "location", "interior", "exterior", "entrance", "entry",
    "building", "restaurant", "bar", "hotel", "store", "office",
    "stage", "room", "terrace", "facade", "façade",
  ],
  PEOPLE: [
    "people", "person", "staff", "team", "guest", "customer", "crowd",
    "bartender", "waiter", "server", "chef", "performer", "singer",
    "musician", "audience", "face", "portrait",
  ],
  PRODUCT: [
    "product", "food", "dish", "meal", "dinner", "lunch", "breakfast",
    "drink", "cocktail", "beer", "wine", "menu", "plate", "serving",
    "pizza", "burger", "kebab", "pita",
  ],
  ACTIVITY: [
    "activity", "game", "pool table", "pooltable", "shuffleboard",
    "dart", "darts", "service", "dining", "celebration", "conversation",
    "social", "playing", "toasting",
  ],
  PERFORMANCE: [
    "live music", "performance", "concert", "band", "singer", "musician",
    "stage", "dance", "dancing", "audience",
  ],
  ATMOSPHERE: [
    "atmosphere", "ambience", "night", "evening", "crowd", "party",
    "social", "energy", "experience", "lighting",
  ],
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "in", "is", "it", "of", "on", "or", "the", "to", "use", "using",
  "with", "create", "film", "video", "brand", "world", "class", "produce",
]);

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function durationFromIntent(intent = "") {
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
  const duration = durationFromIntent(intent);
  return Boolean(
    /\b(video|film|commercial|trailer|motion)\b/.test(normalized(intent)) &&
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

function mediaDuration(asset = {}, node = {}) {
  return finite(
    node.technical?.duration_seconds ||
    node.metadata?.duration_seconds ||
    asset.duration_seconds ||
    asset.metadata?.duration_seconds ||
    asset.analysis?.duration_seconds ||
    asset.analysis?.technical?.duration_seconds ||
    asset.analysis?.technical_inspection?.duration_seconds,
  ) || 0;
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

function primaryEvidence(asset = {}, node = {}) {
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
    asset.metadata?.brand_asset_type,
    node.name,
    node.type,
    node.metadata?.asset_role,
    node.metadata?.role,
    node.metadata?.category,
    node.metadata?.purpose,
    node.metadata?.render_role,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function secondaryEvidence(asset = {}, node = {}) {
  return [
    asset.description,
    asset.tags,
    asset.analysis,
    node.description,
    node.intelligence,
  ].map((value) => typeof value === "string" ? value : safeJson(value))
    .join(" ")
    .toLowerCase();
}

function provenanceEvidence(asset = {}, node = {}) {
  return [
    asset.asset_type,
    asset.metadata?.source_type,
    asset.metadata?.generation_type,
    asset.metadata?.workflow_kind,
    asset.metadata?.render_role,
    node.type,
    node.status,
    node.metadata?.source_type,
    node.metadata?.generation_type,
    node.metadata?.workflow_kind,
    node.metadata?.render_role,
    node.lineage?.source,
    node.lineage?.capability,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function approvedMasterMotion(asset = {}, node = {}) {
  if (mediaKind(asset, node) !== "VIDEO") return false;
  const status = text(node.status || asset.status).toUpperCase();
  const approved = Boolean(
    asset.review?.approved === true ||
    asset.review?.human_reviewed === true ||
    node.review?.approved === true ||
    node.review?.human_reviewed === true ||
    ["APPROVED", "VERIFIED", "READY", "COMPLETE", "COMPLETED"].includes(status)
  );
  const evidence = `${primaryEvidence(asset, node)} ${provenanceEvidence(asset, node)}`;
  return approved && MASTER_MOTION_TERMS.some((term) => evidence.includes(term));
}

function intermediateArtifact(asset = {}, node = {}) {
  const evidence = primaryEvidence(asset, node);
  return INTERMEDIATE_TERMS.some((term) => evidence.includes(term));
}

function derivedArtifact(asset = {}, node = {}) {
  if (node.parent_asset_node_id) return true;
  const status = text(node.status || asset.status).toUpperCase();
  if ([
    "DERIVED", "GENERATED_FRAME", "KEYFRAME", "CROP", "REFRAME",
  ].includes(status)) return true;
  const evidence = provenanceEvidence(asset, node);
  return DERIVED_TERMS.some((term) => evidence.includes(term));
}

function sourceClass(asset = {}, node = {}) {
  if (
    !asset.id ||
    asset.archived === true ||
    asset.disabled === true ||
    asset.deleted_at
  ) return null;

  const kind = mediaKind(asset, node);
  if (!["IMAGE", "VIDEO"].includes(kind) || !verified(asset, node)) return null;
  if (!(asset.file_url || asset.image_url || node.url || node.storage_path)) return null;

  const status = text(node.status || asset.status).toUpperCase();
  if ([
    "REJECTED", "ARCHIVED", "DISABLED", "FAILED", "DELETED",
  ].includes(status)) return null;

  const masterMotion = approvedMasterMotion(asset, node);
  if (intermediateArtifact(asset, node) && !masterMotion) return null;
  if (derivedArtifact(asset, node) && !masterMotion) return null;

  return masterMotion
    ? "APPROVED_MASTER_MOTION"
    : "VERIFIED_SOURCE";
}

function roleMatches(evidence = "") {
  return Object.entries(ROLE_TERMS)
    .filter(([, terms]) => terms.some((term) => evidence.includes(term)))
    .map(([role]) => role);
}

function inferredRoles(asset = {}, node = {}, classification = "") {
  const primary = roleMatches(primaryEvidence(asset, node));
  let roles;

  if (primary.includes("BRAND_MOTION")) {
    roles = ["BRAND_MOTION", "BRAND_MARK"];
  } else if (primary.includes("BRAND_MARK")) {
    roles = ["BRAND_MARK"];
  } else if (primary.includes("LOCATION")) {
    roles = [
      "LOCATION",
      ...primary.filter((role) => [
        "ACTIVITY", "PERFORMANCE", "ATMOSPHERE",
      ].includes(role)),
    ];
  } else if (primary.includes("PRODUCT")) {
    roles = [
      "PRODUCT",
      ...primary.filter((role) => role === "ACTIVITY"),
    ];
  } else if (primary.length) {
    roles = primary;
  } else {
    roles = roleMatches(secondaryEvidence(asset, node));
  }

  if (
    classification === "APPROVED_MASTER_MOTION" &&
    roles.includes("BRAND_MARK") &&
    !roles.includes("BRAND_MOTION")
  ) {
    roles.unshift("BRAND_MOTION");
  }

  return [...new Set(roles)];
}

function representativeNodes(nodes = []) {
  const map = new Map();
  const rank = (node = {}) =>
    (node.parent_asset_node_id ? -500 : 500) +
    (node.review?.approved === true ? 200 : 0) +
    (node.review?.human_reviewed === true ? 100 : 0) +
    (node.review?.ai_reviewed === true ? 25 : 0) +
    (node.url || node.storage_path ? 10 : 0);

  for (const node of nodes) {
    const id = text(node.creative_asset_id);
    if (!id) continue;
    const current = map.get(id);
    if (!current || rank(node) > rank(current)) map.set(id, node);
  }
  return map;
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

function intentTokens(intent = "") {
  return [...new Set(
    normalized(intent)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  )];
}

function candidateScore(candidate, intent = "") {
  const evidence = `${primaryEvidence(candidate.asset, candidate.node)} ${secondaryEvidence(candidate.asset, candidate.node)}`;
  let score = intentTokens(intent)
    .filter((token) => evidence.includes(token)).length * 12;

  score += Math.min(100, Math.max(
    0,
    qualityScore(candidate.asset, candidate.node),
  ));
  score += candidate.media_kind === "VIDEO" ? 90 : 15;
  score += Math.min(120, candidate.duration_seconds * 2);
  score += candidate.source_class === "APPROVED_MASTER_MOTION" ? 160 : 0;
  score += candidate.roles.includes("BRAND_MOTION") ? 220 : 0;
  score += candidate.roles.includes("PEOPLE") ? 25 : 0;
  score += candidate.roles.includes("PERFORMANCE") ? 25 : 0;
  return score;
}

function roleOrder(intent = "") {
  const source = normalized(intent);
  const order = ["BRAND_MOTION", "BRAND_MARK", "LOCATION", "PEOPLE"];

  if (/\b(food|restaurant|bar|hotel|hospitality|dinner|drink|menu)\b/.test(source)) {
    order.push("PRODUCT", "ACTIVITY", "PERFORMANCE", "ATMOSPHERE");
  } else if (/\b(event|music|concert|performance|experience)\b/.test(source)) {
    order.push("PERFORMANCE", "ACTIVITY", "ATMOSPHERE", "PRODUCT");
  } else {
    order.push("PRODUCT", "ACTIVITY", "PERFORMANCE", "ATMOSPHERE");
  }

  return [...new Set(order)];
}

function selectCandidates(candidates = [], intent = "", target = 12) {
  const ranked = [...candidates].sort((left, right) =>
    candidateScore(right, intent) - candidateScore(left, intent),
  );
  const selected = [];
  const used = new Set();

  const take = (candidate, role = null) => {
    if (
      !candidate ||
      used.has(candidate.asset.id) ||
      selected.length >= target
    ) return;

    selected.push({
      ...candidate,
      selected_role: role || candidate.roles[0] || "LONG_FORM_SOURCE",
    });
    used.add(candidate.asset.id);
  };

  for (const role of roleOrder(intent)) {
    take(
      ranked.find((candidate) =>
        !used.has(candidate.asset.id) && candidate.roles.includes(role),
      ),
      role,
    );
  }

  const videos = ranked.filter((candidate) => candidate.media_kind === "VIDEO");
  const requiredVideos = Math.min(
    videos.length,
    Math.max(2, Math.ceil(target / 3)),
  );

  for (const candidate of videos) {
    if (
      selected.filter((item) => item.media_kind === "VIDEO").length >=
      requiredVideos
    ) break;
    take(candidate, candidate.roles[0] || "VIDEO_SOURCE");
  }

  for (const candidate of ranked) take(candidate);
  return selected;
}

function selectedRecord(candidate, intent = "") {
  return {
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
    duration_seconds: candidate.duration_seconds,
    selected_role: candidate.selected_role,
    roles: candidate.roles,
    verified: true,
    source_class: candidate.source_class,
    original_source: candidate.source_class === "VERIFIED_SOURCE",
    approved_master_motion:
      candidate.source_class === "APPROVED_MASTER_MOTION",
    direct_use_policy:
      candidate.source_class === "APPROVED_MASTER_MOTION"
        ? "IMMUTABLE_DIRECT_COMPOSITE"
        : "SOURCE_OR_FACTUAL_REFERENCE",
    source_node_is_root: !candidate.node.parent_asset_node_id,
    role_evidence_source:
      roleMatches(primaryEvidence(candidate.asset, candidate.node)).length
        ? "PRIMARY_ASSET_IDENTITY"
        : "SECONDARY_ASSET_INTELLIGENCE",
    score: candidateScore(candidate, intent),
  };
}

function install() {
  if (CreativeAssetAutoSelectionRuntime[FLAG]) return;

  const originalResolve =
    CreativeAssetAutoSelectionRuntime.resolve.bind(
      CreativeAssetAutoSelectionRuntime,
    );

  Object.defineProperty(CreativeAssetAutoSelectionRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAssetAutoSelectionRuntime.resolve =
    async function resolveWithLongFormCoverage(input = {}) {
      const base = await originalResolve(input);
      if (!longFormTemporal(input.intent)) return base;

      const target = Math.max(
        10,
        Math.min(
          16,
          Math.ceil((durationFromIntent(input.intent) || 60) / 5),
        ),
      );

      const [assets, nodes] = await Promise.all([
        CreativeAssetsRuntime.list({
          organization_id: input.organization_id,
          limit: 1000,
        }),
        CreativeAssetGraphRepository.listByProject({
          organization_id: input.organization_id,
        }),
      ]);

      const nodeMap = representativeNodes(nodes);
      const candidates = assets.map((asset) => {
        const node = nodeMap.get(text(asset.id)) || {};
        const classification = sourceClass(asset, node);
        return {
          asset,
          node,
          source_class: classification,
          media_kind: mediaKind(asset, node),
          duration_seconds: mediaDuration(asset, node),
          roles: inferredRoles(asset, node, classification),
        };
      }).filter((candidate) => Boolean(candidate.source_class));

      const selected = selectCandidates(candidates, input.intent, target);
      const minimum = Math.min(8, target);
      if (selected.length < minimum) {
        throw new Error(
          `CREATIVE_LONG_FORM_SOURCE_COVERAGE_INSUFFICIENT:` +
          `selected=${selected.length};required=${minimum};` +
          `candidates=${candidates.length}`,
        );
      }

      const records = selected.map((candidate) =>
        selectedRecord(candidate, input.intent),
      );
      const selectedRoles = [...new Set(records.flatMap((item) => item.roles))];

      return {
        ...base,
        source: "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE_V3",
        selected_asset_ids: selected.map((candidate) => candidate.asset.id),
        selected_assets: records,
        assets: selected.map((candidate) => candidate.asset),
        long_form_asset_expansion: {
          contract: "CREATIVE_LONG_FORM_ASSET_SELECTION_V3",
          target_asset_count: target,
          base_asset_count: list(base.assets).length,
          candidate_count: candidates.length,
          final_asset_count: selected.length,
          selected_video_count:
            selected.filter((item) => item.media_kind === "VIDEO").length,
          selected_image_count:
            selected.filter((item) => item.media_kind === "IMAGE").length,
          selected_video_duration_seconds: Number(
            selected
              .filter((item) => item.media_kind === "VIDEO")
              .reduce((sum, item) => sum + item.duration_seconds, 0)
              .toFixed(3),
          ),
          approved_master_motion_count:
            selected.filter((item) =>
              item.source_class === "APPROVED_MASTER_MOTION",
            ).length,
          selected_roles: selectedRoles,
          missing_preferred_roles:
            roleOrder(input.intent).filter((role) => !selectedRoles.includes(role)),
          verified_sources_only: true,
          intermediate_campaign_and_layout_assets_excluded: true,
          derived_intermediates_excluded: true,
          approved_master_motion_allowed_as_immutable_composite: true,
          role_classification_prefers_primary_asset_identity: true,
          filename_or_asset_id_override_used: false,
        },
      };
    };
}

install();

export const CreativeLongFormAssetSelectionRuntimeV3 = {
  installed: true,
  durationSeconds: durationFromIntent,
  longFormTemporal,
};
