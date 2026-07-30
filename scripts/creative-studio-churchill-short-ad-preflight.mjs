#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function requiredValue(...values) {
  for (const value of values) {
    const current = text(value);
    if (current) return current;
  }
  return null;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function includesAny(source, words) {
  return words.some((word) => source.includes(word));
}

function originalFileName(item = {}) {
  return text(
    item.metadata?.original_file_name ||
    item.analysis?.storage_evidence?.original_file_name ||
    item.file_name,
  );
}

function storageReference(item = {}) {
  return text(
    item.url ||
    item.storage_path ||
    item.metadata?.storage_path ||
    item.analysis?.storage_evidence?.storage_path,
  );
}

function extension(item = {}) {
  const source = [
    originalFileName(item),
    storageReference(item),
    item.name,
    item.title,
  ].map(text).find(Boolean) || "";
  const clean = source.split("?")[0].split("#")[0];
  const match = clean.toLowerCase().match(/\.([a-z0-9]{2,6})$/);
  return match?.[1] || "";
}

const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg",
  "tif", "tiff", "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "webm",
]);
const AUDIO_EXTENSIONS = new Set([
  "aac", "aiff", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma",
]);

function mimeType(item = {}) {
  return text(
    item.mime_type ||
    item.technical?.mime_type ||
    item.metadata?.mime_type ||
    item.analysis?.technical_inspection?.mime_type ||
    item.analysis?.storage_evidence?.mime_type,
  ).toLowerCase();
}

function mediaKind(item = {}) {
  const declared = text(
    item.media_kind ||
    item.technical?.media_kind ||
    item.metadata?.media_kind ||
    item.asset_type ||
    item.type,
  ).toUpperCase();
  if (["IMAGE", "PHOTO", "LOGO", "GRAPHIC"].includes(declared)) return "IMAGE";
  if (["VIDEO", "MOMENT", "CLIP"].includes(declared)) return "VIDEO";
  if (["AUDIO", "MUSIC", "SONG", "SOUNDTRACK"].includes(declared)) return "AUDIO";

  const mime = mimeType(item);
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";

  const ext = extension(item);
  if (IMAGE_EXTENSIONS.has(ext)) return "IMAGE";
  if (VIDEO_EXTENSIONS.has(ext)) return "VIDEO";
  if (AUDIO_EXTENSIONS.has(ext)) return "AUDIO";
  return "UNKNOWN";
}

function isVisual(item = {}) {
  return ["IMAGE", "VIDEO"].includes(mediaKind(item));
}

function trustedRoleSource(item = {}) {
  return safeJson({
    name: item.name,
    title: item.title,
    file_name: item.file_name,
    original_file_name: originalFileName(item),
    type: item.type,
    asset_type: item.asset_type,
    role: item.role,
    category: item.category,
    tags: item.tags,
    metadata: {
      asset_role: item.metadata?.asset_role,
      role: item.metadata?.role,
      category: item.metadata?.category,
      purpose: item.metadata?.purpose,
      tags: item.metadata?.tags,
      brand_asset_type: item.metadata?.brand_asset_type,
    },
    intelligence: {
      tags: item.intelligence?.tags,
      labels: item.intelligence?.labels,
    },
  });
}

function semanticSource(item = {}) {
  return safeJson({
    trusted: trustedRoleSource(item),
    description: item.description,
    metadata: item.metadata,
    intelligence: item.intelligence,
    analysis: item.analysis,
    technical: item.technical,
    lineage: item.lineage,
  });
}

const CATEGORY_TERMS = {
  LOGO: ["logo", "wordmark", "brand mark", "brandmark", "orange cc"],
  FOOD: [
    "food", "dish", "meal", "pizza", "burger", "kebab", "pita",
    "garlic sauce", "dinner", "restaurant meal", "plate", "kitchen",
  ],
  ATMOSPHERE: [
    "restaurant interior", "bar interior", "venue", "crowd", "guest",
    "people", "nightlife", "live music", "stage", "dining room", "karon",
  ],
  GAMES: [
    "pool table", "shuffleboard", "shuffle board", "dart board", "dartboard",
    "darts", "free games", "game room",
  ],
  AUDIO: ["audio", "music", "soundtrack", "song", "jingle", "live music"],
};

function categories(item = {}) {
  const kind = mediaKind(item);
  const semantic = semanticSource(item);
  const trusted = trustedRoleSource(item);
  const result = [];

  if (isVisual(item) && includesAny(trusted, CATEGORY_TERMS.LOGO)) {
    result.push("LOGO");
  }
  if (isVisual(item) && includesAny(semantic, CATEGORY_TERMS.FOOD)) {
    result.push("FOOD");
  }
  if (isVisual(item) && includesAny(semantic, CATEGORY_TERMS.ATMOSPHERE)) {
    result.push("ATMOSPHERE");
  }
  if (isVisual(item) && includesAny(semantic, CATEGORY_TERMS.GAMES)) {
    result.push("GAMES");
  }
  if (kind === "AUDIO") result.push("AUDIO");

  return unique(result);
}

function usable(item = {}) {
  const status = text(item.status).toUpperCase();
  if (["FAILED", "REJECTED", "ARCHIVED", "DELETED"].includes(status)) {
    return false;
  }
  if (item.archived === true || item.metadata?.blocked === true) return false;
  return Boolean(storageReference(item));
}

function itemProjectId(item = {}) {
  return text(item.creative_project_id || item.metadata?.creative_project_id);
}

function itemMissionId(item = {}) {
  return text(item.creative_mission_id || item.metadata?.creative_mission_id);
}

function looksLikeChurchill(value = {}) {
  const source = safeJson(value);
  return includesAny(source, [
    "churchill restaurant & bar",
    "churchill restaurant",
    "churchill bar",
    "churchill karon",
    "churchill",
  ]);
}

function score(item = {}, category = null) {
  const semantic = semanticSource(item);
  let result = 0;
  if (looksLikeChurchill(item)) result += 50;
  if (semantic.includes("karon")) result += 12;
  if (category && categories(item).includes(category)) result += 30;
  if (item.review?.approved === true) result += 25;
  if (item.review?.human_reviewed === true) result += 15;
  if (item.review?.ai_reviewed === true) result += 5;
  if (text(item.url)) result += 6;
  if (mediaKind(item) === "IMAGE") result += 5;
  if (mediaKind(item) === "VIDEO") result += 4;
  if (item.metadata?.performance_verified === true) result += 4;
  return result;
}

function summarize(item = {}, category = null) {
  return {
    id: item.id || null,
    creative_asset_id: item.creative_asset_id || item.id || null,
    creative_project_id: itemProjectId(item) || null,
    creative_mission_id: itemMissionId(item) || null,
    name: item.name || item.title || originalFileName(item) || null,
    type: item.type || item.asset_type || null,
    media_kind: mediaKind(item),
    mime_type: mimeType(item) || null,
    extension: extension(item) || null,
    status: item.status || null,
    category,
    categories: categories(item),
    score: score(item, category),
    has_url: Boolean(text(item.url)),
    has_storage_path: Boolean(storageReference(item)),
    review: {
      approved: item.review?.approved === true,
      human_reviewed: item.review?.human_reviewed === true,
      ai_reviewed: item.review?.ai_reviewed === true,
    },
    original_file_name: originalFileName(item) || null,
  };
}

function top(items, category, count = 5) {
  return items
    .filter((item) => usable(item) && categories(item).includes(category))
    .sort((left, right) => score(right, category) - score(left, category))
    .slice(0, count)
    .map((item) => summarize(item, category));
}

function findExplicit(items, id) {
  const target = text(id);
  if (!target) return null;
  const item = items.find((candidate) => (
    text(candidate.id) === target || text(candidate.creative_asset_id) === target
  ));
  return item ? summarize(item) : null;
}

function firstDistinct(items, usedIds) {
  const match = items.find((item) => item?.id && !usedIds.has(item.id)) || null;
  if (match) usedIds.add(match.id);
  return match;
}

async function allRows(client, table, organizationId, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const organizationId = requiredValue(
  process.env.CHURCHILL_SMOKE_ORGANIZATION_ID,
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID,
  "9550b843-b83c-4d15-b02d-a0b5ca23346e",
);
const targetDurationSeconds = Math.max(
  8,
  Math.min(12, finite(process.env.CHURCHILL_SMOKE_DURATION_SECONDS, 10)),
);
const hardCostLimit = Math.max(
  0,
  finite(process.env.CHURCHILL_SMOKE_HARD_COST_LIMIT, 250),
);
const currency = text(process.env.CHURCHILL_SMOKE_CURRENCY || "THB").toUpperCase();
const explicitProjectId = text(process.env.CHURCHILL_SMOKE_PROJECT_ID);
const explicitMissionId = text(process.env.CHURCHILL_SMOKE_MISSION_ID);
const explicitLogoId = text(process.env.CHURCHILL_SMOKE_LOGO_ASSET_ID);
const explicitFoodId = text(process.env.CHURCHILL_SMOKE_FOOD_ASSET_ID);
const explicitExperienceId = text(process.env.CHURCHILL_SMOKE_EXPERIENCE_ASSET_ID);
const supabaseUrl = requiredValue(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const serviceRoleKey = requiredValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SERVICE_KEY,
);

if (!supabaseUrl) throw new Error("SUPABASE_URL required");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [assets, nodes, projects, missions] = await Promise.all([
  allRows(client, "creative_assets", organizationId),
  allRows(client, "creative_asset_nodes", organizationId),
  allRows(client, "creative_projects", organizationId),
  allRows(client, "creative_missions", organizationId),
]);

const combined = [
  ...nodes,
  ...assets.map((asset) => ({ ...asset, creative_asset_id: asset.id })),
];

const matchedMissions = missions.filter((mission) => (
  (explicitMissionId && text(mission.id) === explicitMissionId) ||
  looksLikeChurchill(mission)
));
const matchedMissionIds = new Set(matchedMissions.map((mission) => text(mission.id)));
const matchedProjects = projects.filter((project) => (
  (explicitProjectId && text(project.id) === explicitProjectId) ||
  looksLikeChurchill(project) ||
  matchedMissionIds.has(text(project.creative_mission_id))
));
const matchedProjectIds = new Set(matchedProjects.map((project) => text(project.id)));

const explicitAssetsComplete = Boolean(
  explicitLogoId && explicitFoodId && explicitExperienceId,
);
const scopedPool = combined.filter((item) => (
  matchedProjectIds.has(itemProjectId(item)) ||
  matchedMissionIds.has(itemMissionId(item))
));
const discoveryPool = scopedPool.length ? scopedPool : [];

const logoCandidates = top(discoveryPool, "LOGO", 8);
const foodCandidates = top(discoveryPool, "FOOD", 12);
const atmosphereCandidates = top(discoveryPool, "ATMOSPHERE", 12);
const gameCandidates = top(discoveryPool, "GAMES", 12);
const audioCandidates = top(discoveryPool, "AUDIO", 8);

const usedIds = new Set();
const explicitLogo = findExplicit(combined, explicitLogoId);
const explicitFood = findExplicit(combined, explicitFoodId);
const explicitExperience = findExplicit(combined, explicitExperienceId);
const logoPrimary = explicitLogo || firstDistinct(logoCandidates, usedIds);
if (logoPrimary?.id) usedIds.add(logoPrimary.id);
const foodPrimary = explicitFood || firstDistinct(foodCandidates, usedIds);
if (foodPrimary?.id) usedIds.add(foodPrimary.id);
const experiencePrimary = explicitExperience || firstDistinct(
  [...gameCandidates, ...atmosphereCandidates],
  usedIds,
);
const selected = [logoPrimary, foodPrimary, experiencePrimary].filter(Boolean);

const metadataWarnings = [];
if (!matchedProjects.length && !matchedMissions.length) {
  metadataWarnings.push("CHURCHILL_PROJECT_OR_MISSION_NOT_DISCOVERED");
}
if (logoPrimary?.review?.approved !== true) {
  metadataWarnings.push("SELECTED_LOGO_REQUIRES_HUMAN_APPROVAL");
}
if (selected.some((item) => item?.review?.approved !== true)) {
  metadataWarnings.push("SELECTED_ASSETS_REQUIRE_HUMAN_APPROVAL");
}

const identityScopeResolved = Boolean(
  matchedProjects.length || matchedMissions.length || explicitAssetsComplete,
);
const checks = [
  {
    id: "churchill_identity_scope_resolved",
    passed: identityScopeResolved,
    evidence: {
      explicit_project_id: explicitProjectId || null,
      explicit_mission_id: explicitMissionId || null,
      matched_project_ids: [...matchedProjectIds],
      matched_mission_ids: [...matchedMissionIds],
      explicit_assets_complete: explicitAssetsComplete,
    },
  },
  {
    id: "strict_logo_candidate_found",
    passed: Boolean(
      logoPrimary &&
      logoPrimary.media_kind === "IMAGE" &&
      logoPrimary.categories.includes("LOGO")
    ),
    evidence: logoPrimary,
  },
  {
    id: "visual_food_candidate_found",
    passed: Boolean(
      foodPrimary &&
      ["IMAGE", "VIDEO"].includes(foodPrimary.media_kind) &&
      foodPrimary.categories.includes("FOOD")
    ),
    evidence: foodPrimary,
  },
  {
    id: "visual_venue_or_games_candidate_found",
    passed: Boolean(
      experiencePrimary &&
      ["IMAGE", "VIDEO"].includes(experiencePrimary.media_kind) &&
      experiencePrimary.categories.some((category) => (
        category === "ATMOSPHERE" || category === "GAMES"
      ))
    ),
    evidence: experiencePrimary,
  },
  {
    id: "no_audio_selected_as_visual",
    passed: selected.every((item) => item.media_kind !== "AUDIO"),
    evidence: selected.map((item) => ({ id: item.id, media_kind: item.media_kind })),
  },
  {
    id: "three_distinct_shot_assets_available",
    passed: selected.length === 3 && new Set(selected.map((item) => item.id)).size === 3,
    evidence: selected,
  },
  {
    id: "hard_cost_limit_configured",
    passed: hardCostLimit > 0,
    evidence: { maximum_customer_price: hardCostLimit, currency },
  },
];

const blockers = checks.filter((check) => !check.passed).map((check) => check.id);
const ready = blockers.length === 0;
const foodEnd = Number((targetDurationSeconds * 0.34).toFixed(2));
const experienceEnd = Number((targetDurationSeconds * 0.78).toFixed(2));

const report = {
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_CHURCHILL_SHORT_AD_PREFLIGHT_V2",
  ready,
  blocking_reasons: blockers,
  warnings: unique(metadataWarnings),
  organization_id: organizationId,
  identity_scope: {
    explicit_project_id: explicitProjectId || null,
    explicit_mission_id: explicitMissionId || null,
    matched_projects: matchedProjects.map((project) => ({
      id: project.id,
      name: project.name || project.title || null,
      creative_mission_id: project.creative_mission_id || null,
      status: project.status || null,
    })),
    matched_missions: matchedMissions.map((mission) => ({
      id: mission.id,
      title: mission.title || mission.name || null,
      status: mission.status || null,
    })),
    explicit_asset_ids: {
      logo: explicitLogoId || null,
      food: explicitFoodId || null,
      experience: explicitExperienceId || null,
    },
  },
  target: {
    production_type: "SOCIAL_VERTICAL_AD",
    duration_seconds: targetDurationSeconds,
    aspect_ratio: "9:16",
    channels: ["facebook", "instagram"],
    public_publish_authorized: false,
  },
  execution_boundary: {
    maximum_generated_video_shots: 1,
    minimum_existing_asset_shots: 2,
    maximum_customer_price: hardCostLimit,
    currency,
    stop_if_limit_exceeded: true,
    selected_assets_must_be_human_approved: true,
    logo_identity_must_be_human_approved: true,
    human_approval_required_before_paid_execution: true,
    human_approval_required_before_publication: true,
  },
  proposed_storyboard: [
    {
      shot: 1,
      start_seconds: 0,
      end_seconds: foodEnd,
      purpose: "Immediate food appetite hook",
      asset: foodPrimary,
      generation_policy: "USE_EXISTING_ASSET_FIRST",
    },
    {
      shot: 2,
      start_seconds: foodEnd,
      end_seconds: experienceEnd,
      purpose: "Show Churchill atmosphere, games and social energy",
      asset: experiencePrimary,
      generation_policy: "USE_EXISTING_ASSET_OR_ONE_CONTROLLED_ANIMATION",
    },
    {
      shot: 3,
      start_seconds: experienceEnd,
      end_seconds: targetDurationSeconds,
      purpose: "Correct Churchill logo and concise call to action",
      asset: logoPrimary,
      overlay_text: "Free games • Happy hour all day • Live music tonight",
      website: "www.churchillkaron.com",
      generation_policy: "RENDER_TEXT_AND_LOGO_OUTSIDE_GENERATED_PIXELS",
    },
  ],
  selected_asset_ids: unique(selected.map((item) => item.creative_asset_id)),
  selected_asset_node_ids: unique(selected.map((item) => item.id)),
  discovery: {
    database_totals: {
      creative_assets: assets.length,
      creative_asset_nodes: nodes.length,
      creative_projects: projects.length,
      creative_missions: missions.length,
    },
    scoped_asset_count: discoveryPool.length,
    visual_asset_count: discoveryPool.filter(isVisual).length,
    audio_asset_count: discoveryPool.filter((item) => mediaKind(item) === "AUDIO").length,
    unknown_media_count: discoveryPool.filter((item) => mediaKind(item) === "UNKNOWN").length,
    logo_candidates: logoCandidates,
    food_candidates: foodCandidates,
    atmosphere_candidates: atmosphereCandidates,
    games_candidates: gameCandidates,
    audio_candidates: audioCandidates,
  },
  checks,
  provider_calls_executed: 0,
  wallet_charges: 0,
  database_writes: 0,
  runway_called: false,
  production_started: false,
};

const outputPath = text(process.env.CHURCHILL_SHORT_AD_PREFLIGHT_OUTPUT) || path.join(
  os.homedir(),
  "Downloads",
  `CHURCHILL_SHORT_AD_PREFLIGHT_${new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")}.json`,
);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("CHURCHILL SHORT AD PREFLIGHT V2");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`TARGET_DURATION_SECONDS=${targetDurationSeconds}`);
console.log(`HARD_COST_LIMIT=${hardCostLimit}`);
console.log(`CURRENCY=${currency}`);
console.log(`MATCHED_PROJECT_COUNT=${matchedProjects.length}`);
console.log(`MATCHED_MISSION_COUNT=${matchedMissions.length}`);
console.log(`MATCHED_PROJECT_IDS=${[...matchedProjectIds].join(",")}`);
console.log(`MATCHED_MISSION_IDS=${[...matchedMissionIds].join(",")}`);
console.log(`SCOPED_ASSET_COUNT=${discoveryPool.length}`);
console.log(`VISUAL_ASSET_COUNT=${report.discovery.visual_asset_count}`);
console.log(`AUDIO_ASSET_COUNT=${report.discovery.audio_asset_count}`);
console.log(`LOGO_CANDIDATE_COUNT=${logoCandidates.length}`);
console.log(`FOOD_CANDIDATE_COUNT=${foodCandidates.length}`);
console.log(`ATMOSPHERE_CANDIDATE_COUNT=${atmosphereCandidates.length}`);
console.log(`GAMES_CANDIDATE_COUNT=${gameCandidates.length}`);
console.log(`SELECTED_LOGO=${logoPrimary?.name || ""}`);
console.log(`SELECTED_LOGO_MEDIA_KIND=${logoPrimary?.media_kind || ""}`);
console.log(`SELECTED_FOOD=${foodPrimary?.name || ""}`);
console.log(`SELECTED_FOOD_MEDIA_KIND=${foodPrimary?.media_kind || ""}`);
console.log(`SELECTED_EXPERIENCE=${experiencePrimary?.name || ""}`);
console.log(`SELECTED_EXPERIENCE_MEDIA_KIND=${experiencePrimary?.media_kind || ""}`);
console.log(`SELECTED_ASSET_IDS=${report.selected_asset_ids.join(",")}`);
console.log(`SELECTED_ASSET_NODE_IDS=${report.selected_asset_node_ids.join(",")}`);
console.log(`SHORT_AD_PREFLIGHT_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${blockers.join(",")}`);
console.log(`WARNINGS=${report.warnings.join(",")}`);
console.log("SELECTED_ASSETS_REQUIRE_HUMAN_APPROVAL=YES");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${outputPath}`);
console.log("============================================================");

if (!ready) process.exitCode = 2;
