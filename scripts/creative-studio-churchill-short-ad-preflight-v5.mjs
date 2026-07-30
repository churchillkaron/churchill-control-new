#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function candidateText(candidate = {}) {
  return [
    candidate.name,
    candidate.original_file_name,
    candidate.selected_category,
    candidate.record_source,
  ].map(text).join(" ").toLowerCase();
}

const DELIVERY_TERMS = [
  "package",
  "campaign design",
  "facebook feed",
  "instagram feed",
  "social feed",
  "social post",
  "facebook post",
  "instagram post",
  "poster",
  "flyer",
  "banner",
  "thumbnail",
  "storyboard",
  "layout",
  "mockup",
  "creative output",
  "campaign asset",
  "ad design",
  "rendered design",
  "generated design",
  "deliverable",
  "content pack",
  "asset pack",
];

function deliveryAsset(candidate = {}) {
  const source = candidateText(candidate);
  return candidate.derived_creative === true || DELIVERY_TERMS.some((term) => source.includes(term));
}

function originalSource(candidate = {}) {
  return Boolean(
    candidate &&
    candidate.verified === true &&
    candidate.source_visual === true &&
    candidate.derived_creative !== true &&
    text(candidate.original_file_name) &&
    !deliveryAsset(candidate),
  );
}

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const baseReportPath = path.join(os.tmpdir(), `CHURCHILL_SHORT_AD_PREFLIGHT_V5_BASE_${timestamp}.json`);
const v4Path = path.join(process.cwd(), "scripts", "creative-studio-churchill-short-ad-preflight-v4.mjs");

const child = spawnSync(process.execPath, [v4Path], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CHURCHILL_SHORT_AD_PREFLIGHT_OUTPUT: baseReportPath,
  },
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (child.error) throw child.error;
if (child.status !== 0) {
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  throw new Error(`CHURCHILL_V4_BASE_PREFLIGHT_FAILED:${child.status}`);
}

const base = JSON.parse(await fs.readFile(baseReportPath, "utf8"));
await fs.rm(baseReportPath, { force: true });

const logo = base.storyboard?.find((shot) => shot.shot === 3)?.asset || null;
const food = base.storyboard?.find((shot) => shot.shot === 1)?.asset || null;
const experienceCandidates = [
  ...(base.discovery?.games_candidates || []),
  ...(base.discovery?.atmosphere_candidates || []),
];

const usedAssetIds = new Set([
  text(logo?.creative_asset_id),
  text(food?.creative_asset_id),
].filter(Boolean));

const experience = experienceCandidates.find((candidate) => (
  originalSource(candidate) &&
  !usedAssetIds.has(text(candidate.creative_asset_id))
)) || null;

const checks = [
  {
    id: "verified_cc_logo_found",
    passed: Boolean(logo && logo.verified === true && text(logo.creative_asset_id)),
    evidence: logo,
  },
  {
    id: "verified_original_food_source_found",
    passed: originalSource(food),
    evidence: food,
  },
  {
    id: "verified_original_experience_source_found",
    passed: originalSource(experience),
    evidence: experience,
  },
  {
    id: "delivery_assets_excluded",
    passed: [food, experience].filter(Boolean).every((candidate) => !deliveryAsset(candidate)),
    evidence: [food, experience],
  },
  {
    id: "three_distinct_assets",
    passed: new Set([
      text(logo?.creative_asset_id),
      text(food?.creative_asset_id),
      text(experience?.creative_asset_id),
    ].filter(Boolean)).size === 3,
    evidence: [logo, food, experience],
  },
];

const blockers = checks.filter((check) => !check.passed).map((check) => check.id);
const ready = base.ready === true && blockers.length === 0;

const storyboard = (base.storyboard || []).map((shot) => (
  shot.shot === 2
    ? {
        ...shot,
        asset: experience,
        generation_policy: "USE_VERIFIED_ORIGINAL_UPLOADED_SOURCE_ASSET_OR_ONE_CONTROLLED_ANIMATION",
      }
    : shot
));

const outputPath = text(process.env.CHURCHILL_SHORT_AD_PREFLIGHT_OUTPUT) || path.join(
  os.homedir(),
  "Downloads",
  `CHURCHILL_SHORT_AD_PREFLIGHT_V5_${timestamp}.json`,
);

const report = {
  ...base,
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_CHURCHILL_STRICT_ORIGINAL_SOURCE_PREFLIGHT_V5",
  ready,
  blocking_reasons: unique([...(base.blocking_reasons || []), ...blockers]),
  storyboard,
  selected_asset_ids: unique([
    logo?.creative_asset_id,
    food?.creative_asset_id,
    experience?.creative_asset_id,
  ]),
  strict_source_gate: {
    delivery_terms: DELIVERY_TERMS,
    original_food_source: originalSource(food),
    original_experience_source: originalSource(experience),
    rejected_experience_candidates: experienceCandidates
      .filter((candidate) => !originalSource(candidate))
      .map((candidate) => ({
        creative_asset_id: candidate.creative_asset_id || null,
        name: candidate.name || null,
        original_file_name: candidate.original_file_name || null,
        delivery_asset: deliveryAsset(candidate),
        source_visual: candidate.source_visual === true,
        derived_creative: candidate.derived_creative === true,
      })),
  },
  checks: [...(base.checks || []), ...checks],
  provider_calls_executed: 0,
  wallet_charges: 0,
  database_writes: 0,
  runway_called: false,
  production_started: false,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("CHURCHILL SHORT AD STRICT ORIGINAL-SOURCE PREFLIGHT V5");
console.log("============================================================");
console.log("CHURCHILL_ORGANIZATION_GUARD=PASS");
console.log(`ORGANIZATION_ID=${base.organization?.id || ""}`);
console.log(`ORGANIZATION_NAME=${base.organization?.name || ""}`);
console.log(`VERIFIED_ASSET_COUNT=${base.discovery?.verified_asset_count ?? 0}`);
console.log(`EXPERIENCE_CANDIDATE_COUNT=${experienceCandidates.length}`);
console.log(`REJECTED_DELIVERY_OR_NON_SOURCE_COUNT=${report.strict_source_gate.rejected_experience_candidates.length}`);
console.log(`SELECTED_LOGO=${logo?.name || logo?.original_file_name || ""}`);
console.log(`SELECTED_LOGO_ASSET_ID=${logo?.creative_asset_id || ""}`);
console.log(`SELECTED_FOOD=${food?.name || food?.original_file_name || ""}`);
console.log(`SELECTED_FOOD_ORIGINAL_FILE=${food?.original_file_name || ""}`);
console.log(`SELECTED_FOOD_ORIGINAL_SOURCE=${originalSource(food) ? "YES" : "NO"}`);
console.log(`SELECTED_EXPERIENCE=${experience?.name || experience?.original_file_name || ""}`);
console.log(`SELECTED_EXPERIENCE_ORIGINAL_FILE=${experience?.original_file_name || ""}`);
console.log(`SELECTED_EXPERIENCE_ASSET_ID=${experience?.creative_asset_id || ""}`);
console.log(`SELECTED_EXPERIENCE_ORIGINAL_SOURCE=${originalSource(experience) ? "YES" : "NO"}`);
console.log(`SELECTED_EXPERIENCE_DELIVERY_ASSET=${experience ? (deliveryAsset(experience) ? "YES" : "NO") : ""}`);
console.log(`SHORT_AD_PREFLIGHT_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${report.blocking_reasons.join(",")}`);
console.log("AUTO_SELECTION_SOURCE=VERIFIED_CHURCHILL_ORIGINAL_SOURCE_INTELLIGENCE");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${outputPath}`);
console.log("============================================================");

if (!ready) process.exitCode = 2;
