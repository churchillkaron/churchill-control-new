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

function haystack(item = {}) {
  return safeJson({
    name: item.name,
    title: item.title,
    description: item.description,
    file_name: item.file_name,
    original_file_name:
      item.metadata?.original_file_name ||
      item.analysis?.storage_evidence?.original_file_name,
    type: item.type || item.asset_type,
    metadata: item.metadata,
    intelligence: item.intelligence,
    analysis: item.analysis,
    technical: item.technical,
    review: item.review,
    lineage: item.lineage,
  });
}

function includesAny(source, words) {
  return words.some((word) => source.includes(word));
}

const CATEGORY_TERMS = {
  LOGO: [
    "logo", "wordmark", "brand mark", "brandmark", "churchill logo",
    "orange cc", "churchill restaurant", "churchill karon",
  ],
  FOOD: [
    "food", "dish", "menu", "pizza", "burger", "kebab", "pita",
    "garlic sauce", "dinner", "restaurant meal", "plate", "kitchen",
  ],
  ATMOSPHERE: [
    "restaurant", "bar", "interior", "venue", "crowd", "guest",
    "people", "nightlife", "live music", "stage", "dinner", "karon",
  ],
  GAMES: [
    "pool table", "pool", "shuffleboard", "shuffle board", "dart",
    "darts", "game", "games",
  ],
  AUDIO: [
    "audio", "music", "soundtrack", "song", "jingle", "live music",
  ],
};

function categories(item = {}) {
  const source = haystack(item);
  return Object.entries(CATEGORY_TERMS)
    .filter(([, terms]) => includesAny(source, terms))
    .map(([category]) => category);
}

function usable(item = {}) {
  const status = text(item.status).toUpperCase();
  if (["FAILED", "REJECTED", "ARCHIVED", "DELETED"].includes(status)) {
    return false;
  }
  if (item.archived === true || item.metadata?.blocked === true) return false;
  return Boolean(
    text(item.url) ||
    text(item.storage_path) ||
    text(item.metadata?.storage_path) ||
    text(item.analysis?.storage_evidence?.storage_path),
  );
}

function score(item = {}, category = null) {
  const source = haystack(item);
  let result = 0;
  if (source.includes("churchill")) result += 40;
  if (source.includes("karon")) result += 12;
  if (category && categories(item).includes(category)) result += 25;
  if (item.review?.approved === true) result += 20;
  if (item.review?.human_reviewed === true) result += 12;
  if (item.review?.ai_reviewed === true) result += 5;
  if (text(item.url)) result += 6;
  if (text(item.type).toUpperCase() === "IMAGE") result += 3;
  if (text(item.type).toUpperCase() === "VIDEO") result += 4;
  if (item.metadata?.performance_verified === true) result += 4;
  return result;
}

function summarize(item = {}, category = null) {
  return {
    id: item.id || null,
    creative_asset_id: item.creative_asset_id || item.id || null,
    creative_project_id:
      item.creative_project_id || item.metadata?.creative_project_id || null,
    name: item.name || item.title || null,
    type: item.type || item.asset_type || null,
    status: item.status || null,
    category,
    categories: categories(item),
    score: score(item, category),
    has_url: Boolean(text(item.url)),
    has_storage_path: Boolean(
      text(item.storage_path) ||
      text(item.metadata?.storage_path) ||
      text(item.analysis?.storage_evidence?.storage_path),
    ),
    review: {
      approved: item.review?.approved === true,
      human_reviewed: item.review?.human_reviewed === true,
      ai_reviewed: item.review?.ai_reviewed === true,
    },
    original_file_name:
      item.metadata?.original_file_name ||
      item.analysis?.storage_evidence?.original_file_name ||
      null,
  };
}

function top(items, category, count = 5) {
  return items
    .filter((item) => usable(item) && categories(item).includes(category))
    .sort((left, right) => score(right, category) - score(left, category))
    .slice(0, count)
    .map((item) => summarize(item, category));
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

const [assets, nodes] = await Promise.all([
  allRows(client, "creative_assets", organizationId),
  allRows(client, "creative_asset_nodes", organizationId),
]);

const combined = [
  ...nodes,
  ...assets.map((asset) => ({ ...asset, creative_asset_id: asset.id })),
];
const explicitChurchill = combined.filter((item) =>
  haystack(item).includes("churchill"),
);

// The organization boundary already isolates Churchill-owned assets. Keep the
// full organization pool so food or venue uploads with camera filenames are not
// accidentally discarded merely because their metadata omits the venue name.
const discoveryPool = combined;

const logo = top(discoveryPool, "LOGO", 5);
const food = top(discoveryPool, "FOOD", 8);
const atmosphere = top(discoveryPool, "ATMOSPHERE", 8);
const games = top(discoveryPool, "GAMES", 8);
const audio = top(discoveryPool, "AUDIO", 5);

const usedIds = new Set();
const logoPrimary = firstDistinct(logo, usedIds);
const foodPrimary = firstDistinct(food, usedIds);
const experiencePrimary = firstDistinct([...games, ...atmosphere], usedIds);
const selected = [logoPrimary, foodPrimary, experiencePrimary].filter(Boolean);

const checks = [
  {
    id: "churchill_identity_assets_found",
    passed: explicitChurchill.length > 0,
    evidence: explicitChurchill.length,
  },
  {
    id: "logo_candidate_found",
    passed: logo.length > 0,
    evidence: logo.slice(0, 3),
  },
  {
    id: "food_candidate_found",
    passed: food.length > 0,
    evidence: food.slice(0, 3),
  },
  {
    id: "venue_or_games_candidate_found",
    passed: atmosphere.length > 0 || games.length > 0,
    evidence: { atmosphere: atmosphere.slice(0, 3), games: games.slice(0, 3) },
  },
  {
    id: "three_distinct_shot_assets_available",
    passed: selected.length >= 3,
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
  mode: "READ_ONLY_CHURCHILL_SHORT_AD_PREFLIGHT",
  ready,
  blocking_reasons: blockers,
  organization_id: organizationId,
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
    creative_asset_count: assets.length,
    creative_asset_node_count: nodes.length,
    explicit_churchill_match_count: explicitChurchill.length,
    logo_candidates: logo,
    food_candidates: food,
    atmosphere_candidates: atmosphere,
    games_candidates: games,
    audio_candidates: audio,
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
console.log("CHURCHILL SHORT AD PREFLIGHT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`TARGET_DURATION_SECONDS=${targetDurationSeconds}`);
console.log(`HARD_COST_LIMIT=${hardCostLimit}`);
console.log(`CURRENCY=${currency}`);
console.log(`EXPLICIT_CHURCHILL_MATCH_COUNT=${explicitChurchill.length}`);
console.log(`LOGO_CANDIDATE_COUNT=${logo.length}`);
console.log(`FOOD_CANDIDATE_COUNT=${food.length}`);
console.log(`ATMOSPHERE_CANDIDATE_COUNT=${atmosphere.length}`);
console.log(`GAMES_CANDIDATE_COUNT=${games.length}`);
console.log(`SELECTED_ASSET_IDS=${report.selected_asset_ids.join(",")}`);
console.log(`SELECTED_ASSET_NODE_IDS=${report.selected_asset_node_ids.join(",")}`);
console.log(`SHORT_AD_PREFLIGHT_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${blockers.join(",")}`);
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${outputPath}`);
console.log("============================================================");

if (!ready) process.exitCode = 2;
