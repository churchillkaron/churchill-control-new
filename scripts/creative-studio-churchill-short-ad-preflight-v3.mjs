#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const CHURCHILL_ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

function text(value) {
  return String(value ?? "").trim();
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

function includesAny(source, terms) {
  return terms.some((term) => source.includes(term));
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
  return clean.toLowerCase().match(/\.([a-z0-9]{2,6})$/)?.[1] || "";
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

function trustedSource(item = {}) {
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
      subject: item.metadata?.subject,
    },
    intelligence: {
      tags: item.intelligence?.tags,
      labels: item.intelligence?.labels,
      subject: item.intelligence?.subject,
      scene: item.intelligence?.scene,
    },
  });
}

function semanticSource(item = {}) {
  return safeJson({
    trusted: trustedSource(item),
    description: item.description,
    metadata: item.metadata,
    intelligence: item.intelligence,
    analysis: item.analysis,
    technical: item.technical,
    review: item.review,
    lineage: item.lineage,
  });
}

const TERMS = {
  LOGO: [
    "cc logo", "cc-logo", "cc_logo", "churchill logo", "churchill-logo",
    "orange cc", "brand logo", "wordmark", "brandmark", "logo",
  ],
  FOOD: [
    "food", "dish", "meal", "pizza", "burger", "kebab", "pita",
    "garlic sauce", "dinner", "plate", "menu item", "kitchen",
  ],
  ATMOSPHERE: [
    "restaurant interior", "bar interior", "venue", "crowd", "guest",
    "people", "nightlife", "live music", "stage", "dining room",
    "restaurant atmosphere", "bar atmosphere",
  ],
  GAMES: [
    "pool table", "shuffleboard", "shuffle board", "dart board", "dartboard",
    "darts", "free games", "game room", "pool tables",
  ],
};

function categories(item = {}) {
  const kind = mediaKind(item);
  if (!["IMAGE", "VIDEO"].includes(kind)) return [];

  const trusted = trustedSource(item);
  const semantic = semanticSource(item);
  const result = [];

  if (kind === "IMAGE" && includesAny(trusted, TERMS.LOGO)) result.push("LOGO");
  if (includesAny(semantic, TERMS.FOOD)) result.push("FOOD");
  if (includesAny(semantic, TERMS.ATMOSPHERE)) result.push("ATMOSPHERE");
  if (includesAny(semantic, TERMS.GAMES)) result.push("GAMES");

  return unique(result);
}

function normalizedStatus(item = {}) {
  return text(
    item.review?.status ||
    item.metadata?.verification_status ||
    item.metadata?.analysis_status ||
    item.intelligence?.status ||
    item.analysis?.status ||
    item.status,
  ).toUpperCase();
}

function verified(item = {}) {
  const status = normalizedStatus(item);
  return Boolean(
    item.review?.approved === true ||
    item.review?.human_reviewed === true ||
    item.review?.ai_reviewed === true ||
    item.metadata?.verified === true ||
    item.metadata?.asset_verified === true ||
    item.metadata?.analysis_complete === true ||
    item.intelligence?.verified === true ||
    item.analysis?.verified === true ||
    ["APPROVED", "VERIFIED", "COMPLETE", "COMPLETED", "READY", "ACTIVE"].includes(status),
  );
}

function usable(item = {}) {
  const status = text(item.status).toUpperCase();
  if (["FAILED", "REJECTED", "ARCHIVED", "DELETED"].includes(status)) return false;
  if (item.archived === true || item.metadata?.blocked === true) return false;
  return Boolean(storageReference(item));
}

function assetIdentity(item = {}) {
  return text(item.creative_asset_id || item.id);
}

function score(item = {}, category) {
  const source = semanticSource(item);
  let result = 0;
  if (verified(item)) result += 100;
  if (categories(item).includes(category)) result += 50;
  if (category === "LOGO" && includesAny(trustedSource(item), ["cc logo", "cc-logo", "cc_logo"])) result += 100;
  if (source.includes("churchill")) result += 25;
  if (text(item.url)) result += 8;
  if (mediaKind(item) === "IMAGE") result += 6;
  if (mediaKind(item) === "VIDEO") result += 4;
  return result;
}

function summarize(item = {}, category = null) {
  return {
    id: item.id || null,
    creative_asset_id: assetIdentity(item) || null,
    name: item.name || item.title || originalFileName(item) || null,
    original_file_name: originalFileName(item) || null,
    media_kind: mediaKind(item),
    mime_type: mimeType(item) || null,
    extension: extension(item) || null,
    categories: categories(item),
    selected_category: category,
    verified: verified(item),
    verification_status: normalizedStatus(item) || null,
    score: category ? score(item, category) : null,
    review: item.review || null,
  };
}

function top(items, category, count = 10) {
  return items
    .filter((item) => usable(item))
    .filter((item) => verified(item))
    .filter((item) => categories(item).includes(category))
    .sort((left, right) => score(right, category) - score(left, category))
    .slice(0, count);
}

function firstDistinct(items, usedAssetIds) {
  const match = items.find((item) => {
    const id = assetIdentity(item);
    return id && !usedAssetIds.has(id);
  }) || null;
  if (match) usedAssetIds.add(assetIdentity(match));
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

const requestedOrganizationId = text(
  process.env.CHURCHILL_SMOKE_ORGANIZATION_ID || CHURCHILL_ORGANIZATION_ID,
);
if (requestedOrganizationId !== CHURCHILL_ORGANIZATION_ID) {
  throw new Error(
    `CHURCHILL_ORGANIZATION_MISMATCH: expected ${CHURCHILL_ORGANIZATION_ID}, received ${requestedOrganizationId}`,
  );
}

const supabaseUrl = text(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const serviceRoleKey = text(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);
if (!supabaseUrl) throw new Error("SUPABASE_URL required");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { transport: WebSocket },
});

const { data: organization, error: organizationError } = await client
  .from("organizations")
  .select("id,name,status,industry")
  .eq("id", CHURCHILL_ORGANIZATION_ID)
  .maybeSingle();
if (organizationError) throw organizationError;
if (!organization) throw new Error("CHURCHILL_ORGANIZATION_NOT_FOUND");
if (!text(organization.name).toLowerCase().includes("churchill")) {
  throw new Error(`CHURCHILL_ORGANIZATION_NAME_MISMATCH: ${organization.name || "unknown"}`);
}

const [assets, nodes] = await Promise.all([
  allRows(client, "creative_assets", CHURCHILL_ORGANIZATION_ID),
  allRows(client, "creative_asset_nodes", CHURCHILL_ORGANIZATION_ID),
]);

const assetById = new Map(assets.map((asset) => [text(asset.id), asset]));
const records = [
  ...assets,
  ...nodes.map((node) => {
    const parent = assetById.get(text(node.creative_asset_id)) || {};
    return {
      ...parent,
      ...node,
      metadata: { ...(parent.metadata || {}), ...(node.metadata || {}) },
      intelligence: { ...(parent.intelligence || {}), ...(node.intelligence || {}) },
      analysis: { ...(parent.analysis || {}), ...(node.analysis || {}) },
      technical: { ...(parent.technical || {}), ...(node.technical || {}) },
      review: { ...(parent.review || {}), ...(node.review || {}) },
      creative_asset_id: node.creative_asset_id || parent.id,
    };
  }),
];

const representativeByAsset = new Map();
for (const item of records) {
  const id = assetIdentity(item);
  if (!id || !usable(item)) continue;
  const current = representativeByAsset.get(id);
  const currentScore = current ? (verified(current) ? 100 : 0) + categories(current).length * 10 : -1;
  const nextScore = (verified(item) ? 100 : 0) + categories(item).length * 10 + (text(item.url) ? 3 : 0);
  if (!current || nextScore > currentScore) representativeByAsset.set(id, item);
}

const library = [...representativeByAsset.values()];
const logoCandidates = top(library, "LOGO", 10);
const foodCandidates = top(library, "FOOD", 15);
const gamesCandidates = top(library, "GAMES", 15);
const atmosphereCandidates = top(library, "ATMOSPHERE", 15);

const usedAssetIds = new Set();
const logo = firstDistinct(logoCandidates, usedAssetIds);
const food = firstDistinct(foodCandidates, usedAssetIds);
const experience = firstDistinct([...gamesCandidates, ...atmosphereCandidates], usedAssetIds);
const selected = [logo, food, experience].filter(Boolean);

const targetDurationSeconds = Math.max(
  8,
  Math.min(12, finite(process.env.CHURCHILL_SMOKE_DURATION_SECONDS, 10)),
);
const hardCostLimit = Math.max(
  0,
  finite(process.env.CHURCHILL_SMOKE_HARD_COST_LIMIT, 250),
);
const currency = text(process.env.CHURCHILL_SMOKE_CURRENCY || "THB").toUpperCase();

const checks = [
  {
    id: "churchill_organization_guard",
    passed: organization.id === CHURCHILL_ORGANIZATION_ID,
    evidence: organization,
  },
  {
    id: "verified_cc_logo_found",
    passed: Boolean(
      logo &&
      mediaKind(logo) === "IMAGE" &&
      verified(logo) &&
      categories(logo).includes("LOGO"),
    ),
    evidence: logo ? summarize(logo, "LOGO") : null,
  },
  {
    id: "verified_food_asset_found",
    passed: Boolean(food && verified(food) && categories(food).includes("FOOD")),
    evidence: food ? summarize(food, "FOOD") : null,
  },
  {
    id: "verified_experience_asset_found",
    passed: Boolean(
      experience &&
      verified(experience) &&
      categories(experience).some((category) => ["GAMES", "ATMOSPHERE"].includes(category)),
    ),
    evidence: experience ? summarize(experience, "EXPERIENCE") : null,
  },
  {
    id: "three_distinct_verified_assets",
    passed: selected.length === 3 && new Set(selected.map(assetIdentity)).size === 3,
    evidence: selected.map((item) => summarize(item)),
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
  mode: "READ_ONLY_CHURCHILL_VERIFIED_ASSET_PREFLIGHT_V3",
  organization,
  ready,
  blocking_reasons: blockers,
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
    human_approval_required_before_paid_execution: true,
    human_approval_required_before_publication: true,
  },
  storyboard: [
    {
      shot: 1,
      start_seconds: 0,
      end_seconds: foodEnd,
      purpose: "Immediate food appetite hook",
      asset: food ? summarize(food, "FOOD") : null,
      generation_policy: "USE_VERIFIED_EXISTING_ASSET_FIRST",
    },
    {
      shot: 2,
      start_seconds: foodEnd,
      end_seconds: experienceEnd,
      purpose: "Show Churchill atmosphere, games and social energy",
      asset: experience ? summarize(experience, "EXPERIENCE") : null,
      generation_policy: "USE_VERIFIED_EXISTING_ASSET_OR_ONE_CONTROLLED_ANIMATION",
    },
    {
      shot: 3,
      start_seconds: experienceEnd,
      end_seconds: targetDurationSeconds,
      purpose: "Correct Churchill logo and concise call to action",
      asset: logo ? summarize(logo, "LOGO") : null,
      overlay_text: "Free games • Happy hour all day • Live music tonight",
      website: "www.churchillkaron.com",
      generation_policy: "RENDER_VERIFIED_LOGO_AND_TEXT_OUTSIDE_GENERATED_PIXELS",
    },
  ],
  selected_asset_ids: selected.map(assetIdentity),
  discovery: {
    creative_asset_count: assets.length,
    creative_asset_node_count: nodes.length,
    distinct_asset_count: library.length,
    verified_asset_count: library.filter(verified).length,
    verified_logo_candidate_count: logoCandidates.length,
    verified_food_candidate_count: foodCandidates.length,
    verified_games_candidate_count: gamesCandidates.length,
    verified_atmosphere_candidate_count: atmosphereCandidates.length,
    logo_candidates: logoCandidates.map((item) => summarize(item, "LOGO")),
    food_candidates: foodCandidates.map((item) => summarize(item, "FOOD")),
    games_candidates: gamesCandidates.map((item) => summarize(item, "GAMES")),
    atmosphere_candidates: atmosphereCandidates.map((item) => summarize(item, "ATMOSPHERE")),
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
  `CHURCHILL_SHORT_AD_PREFLIGHT_V3_${new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")}.json`,
);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("CHURCHILL SHORT AD VERIFIED-ASSET PREFLIGHT V3");
console.log("============================================================");
console.log("CHURCHILL_ORGANIZATION_GUARD=PASS");
console.log(`ORGANIZATION_ID=${organization.id}`);
console.log(`ORGANIZATION_NAME=${organization.name}`);
console.log(`CREATIVE_ASSET_COUNT=${assets.length}`);
console.log(`CREATIVE_ASSET_NODE_COUNT=${nodes.length}`);
console.log(`DISTINCT_ASSET_COUNT=${library.length}`);
console.log(`VERIFIED_ASSET_COUNT=${report.discovery.verified_asset_count}`);
console.log(`VERIFIED_LOGO_CANDIDATE_COUNT=${logoCandidates.length}`);
console.log(`VERIFIED_FOOD_CANDIDATE_COUNT=${foodCandidates.length}`);
console.log(`VERIFIED_GAMES_CANDIDATE_COUNT=${gamesCandidates.length}`);
console.log(`VERIFIED_ATMOSPHERE_CANDIDATE_COUNT=${atmosphereCandidates.length}`);
console.log(`SELECTED_LOGO=${logo?.name || logo?.title || originalFileName(logo) || ""}`);
console.log(`SELECTED_LOGO_ASSET_ID=${logo ? assetIdentity(logo) : ""}`);
console.log(`SELECTED_FOOD=${food?.name || food?.title || originalFileName(food) || ""}`);
console.log(`SELECTED_FOOD_ASSET_ID=${food ? assetIdentity(food) : ""}`);
console.log(`SELECTED_EXPERIENCE=${experience?.name || experience?.title || originalFileName(experience) || ""}`);
console.log(`SELECTED_EXPERIENCE_ASSET_ID=${experience ? assetIdentity(experience) : ""}`);
console.log(`SHORT_AD_PREFLIGHT_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${blockers.join(",")}`);
console.log("AUTO_SELECTION_SOURCE=VERIFIED_CHURCHILL_ASSET_INTELLIGENCE");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${outputPath}`);
console.log("============================================================");

if (!ready) process.exitCode = 2;
