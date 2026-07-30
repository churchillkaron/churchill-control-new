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
  "package", "campaign", "facebook feed", "instagram feed", "social feed",
  "social post", "facebook post", "instagram post", "poster", "flyer",
  "banner", "thumbnail", "storyboard", "layout", "mockup", "creative output",
  "campaign asset", "ad design", "rendered design", "generated design",
  "deliverable", "content pack", "asset pack", "design package",
];

const DERIVED_FRAME_TERMS = [
  "keyframe", "key frame", "still frame", "extracted frame", "frame extraction",
  "source frame", "video frame", "generated frame", "scene frame", "shot frame",
  "clip frame", "reference frame", "crop", "cropped", "reframe", "reframed",
  "derived still", "generated still", "scene still",
];

function containsAny(source, terms) {
  return terms.some((term) => source.includes(term));
}

function deliveryAsset(candidate = {}) {
  return candidate.derived_creative === true || containsAny(candidateText(candidate), DELIVERY_TERMS);
}

function derivedFrame(candidate = {}) {
  return containsAny(candidateText(candidate), DERIVED_FRAME_TERMS);
}

function originalUpload(candidate = {}) {
  return Boolean(
    candidate &&
    candidate.verified === true &&
    candidate.source_visual === true &&
    candidate.derived_creative !== true &&
    candidate.record_source === "ASSET" &&
    text(candidate.original_file_name) &&
    !deliveryAsset(candidate) &&
    !derivedFrame(candidate),
  );
}

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const baseReportPath = path.join(os.tmpdir(), `CHURCHILL_SHORT_AD_PREFLIGHT_V6_BASE_${timestamp}.json`);
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
if (![0, 2].includes(child.status)) {
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  throw new Error(`CHURCHILL_V4_BASE_PREFLIGHT_FAILED:${child.status}`);
}

const base = JSON.parse(await fs.readFile(baseReportPath, "utf8"));
await fs.rm(baseReportPath, { force: true });

const logo = base.storyboard?.find((shot) => shot.shot === 3)?.asset || null;
const foodCandidates = base.discovery?.food_candidates || [];
const experienceCandidates = [
  ...(base.discovery?.games_candidates || []),
  ...(base.discovery?.atmosphere_candidates || []),
];

const logoAssetId = text(logo?.creative_asset_id);
const food = foodCandidates.find((candidate) => (
  originalUpload(candidate) && text(candidate.creative_asset_id) !== logoAssetId
)) || null;

const usedAssetIds = new Set([
  logoAssetId,
  text(food?.creative_asset_id),
].filter(Boolean));

const experience = experienceCandidates.find((candidate) => (
  originalUpload(candidate) && !usedAssetIds.has(text(candidate.creative_asset_id))
)) || null;

const checks = [
  {
    id: "verified_cc_logo_found",
    passed: Boolean(logo && logo.verified === true && logoAssetId),
    evidence: logo,
  },
  {
    id: "verified_original_uploaded_food_found",
    passed: originalUpload(food),
    evidence: food,
  },
  {
    id: "verified_original_uploaded_experience_found",
    passed: originalUpload(experience),
    evidence: experience,
  },
  {
    id: "node_keyframe_and_delivery_assets_excluded",
    passed: [food, experience].filter(Boolean).every((candidate) => (
      candidate.record_source === "ASSET" &&
      !deliveryAsset(candidate) &&
      !derivedFrame(candidate)
    )),
    evidence: [food, experience],
  },
  {
    id: "three_distinct_assets",
    passed: new Set([
      logoAssetId,
      text(food?.creative_asset_id),
      text(experience?.creative_asset_id),
    ].filter(Boolean)).size === 3,
    evidence: [logo, food, experience],
  },
];

const strictBlockers = checks.filter((check) => !check.passed).map((check) => check.id);
const baseBlockersExceptSourceSelection = (base.blocking_reasons || []).filter((blocker) => ![
  "verified_source_food_asset_found",
  "verified_source_experience_asset_found",
  "derived_campaign_assets_excluded_from_source_shots",
  "three_distinct_verified_assets",
].includes(blocker));
const blockers = unique([...baseBlockersExceptSourceSelection, ...strictBlockers]);
const ready = blockers.length === 0;

const storyboard = (base.storyboard || []).map((shot) => {
  if (shot.shot === 1) {
    return {
      ...shot,
      asset: food,
      generation_policy: "USE_VERIFIED_ORIGINAL_UPLOADED_FOOD_ASSET",
    };
  }
  if (shot.shot === 2) {
    return {
      ...shot,
      asset: experience,
      generation_policy: "USE_VERIFIED_ORIGINAL_UPLOADED_VENUE_ASSET_OR_ONE_CONTROLLED_ANIMATION",
    };
  }
  return shot;
});

const rejectedCandidates = unique([
  ...foodCandidates,
  ...experienceCandidates,
].filter((candidate) => !originalUpload(candidate)).map((candidate) => JSON.stringify({
  creative_asset_id: candidate.creative_asset_id || null,
  name: candidate.name || null,
  original_file_name: candidate.original_file_name || null,
  record_source: candidate.record_source || null,
  delivery_asset: deliveryAsset(candidate),
  derived_frame: derivedFrame(candidate),
  source_visual: candidate.source_visual === true,
  derived_creative: candidate.derived_creative === true,
}))).map((value) => JSON.parse(value));

const outputPath = text(process.env.CHURCHILL_SHORT_AD_PREFLIGHT_OUTPUT) || path.join(
  os.homedir(),
  "Downloads",
  `CHURCHILL_SHORT_AD_PREFLIGHT_V6_${timestamp}.json`,
);

const report = {
  ...base,
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_CHURCHILL_ORIGINAL_UPLOAD_PREFLIGHT_V6",
  ready,
  blocking_reasons: blockers,
  storyboard,
  selected_asset_ids: unique([
    logoAssetId,
    food?.creative_asset_id,
    experience?.creative_asset_id,
  ]),
  strict_original_upload_gate: {
    required_record_source: "ASSET",
    delivery_terms: DELIVERY_TERMS,
    derived_frame_terms: DERIVED_FRAME_TERMS,
    original_food_upload: originalUpload(food),
    original_experience_upload: originalUpload(experience),
    rejected_candidates: rejectedCandidates,
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
console.log("CHURCHILL SHORT AD ORIGINAL-UPLOAD PREFLIGHT V6");
console.log("============================================================");
console.log("CHURCHILL_ORGANIZATION_GUARD=PASS");
console.log(`ORGANIZATION_ID=${base.organization?.id || ""}`);
console.log(`ORGANIZATION_NAME=${base.organization?.name || ""}`);
console.log(`VERIFIED_ASSET_COUNT=${base.discovery?.verified_asset_count ?? 0}`);
console.log(`FOOD_CANDIDATE_COUNT=${foodCandidates.length}`);
console.log(`EXPERIENCE_CANDIDATE_COUNT=${experienceCandidates.length}`);
console.log(`REJECTED_NON_ORIGINAL_UPLOAD_COUNT=${rejectedCandidates.length}`);
console.log(`SELECTED_LOGO=${logo?.name || logo?.original_file_name || ""}`);
console.log(`SELECTED_LOGO_ASSET_ID=${logoAssetId}`);
console.log(`SELECTED_FOOD=${food?.name || food?.original_file_name || ""}`);
console.log(`SELECTED_FOOD_ORIGINAL_FILE=${food?.original_file_name || ""}`);
console.log(`SELECTED_FOOD_RECORD_SOURCE=${food?.record_source || ""}`);
console.log(`SELECTED_FOOD_ORIGINAL_UPLOAD=${originalUpload(food) ? "YES" : "NO"}`);
console.log(`SELECTED_EXPERIENCE=${experience?.name || experience?.original_file_name || ""}`);
console.log(`SELECTED_EXPERIENCE_ORIGINAL_FILE=${experience?.original_file_name || ""}`);
console.log(`SELECTED_EXPERIENCE_ASSET_ID=${experience?.creative_asset_id || ""}`);
console.log(`SELECTED_EXPERIENCE_RECORD_SOURCE=${experience?.record_source || ""}`);
console.log(`SELECTED_EXPERIENCE_ORIGINAL_UPLOAD=${originalUpload(experience) ? "YES" : "NO"}`);
console.log(`SELECTED_EXPERIENCE_DERIVED_FRAME=${experience ? (derivedFrame(experience) ? "YES" : "NO") : ""}`);
console.log(`SELECTED_EXPERIENCE_DELIVERY_ASSET=${experience ? (deliveryAsset(experience) ? "YES" : "NO") : ""}`);
console.log(`SHORT_AD_PREFLIGHT_READY=${ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${blockers.join(",")}`);
console.log("AUTO_SELECTION_SOURCE=VERIFIED_CHURCHILL_ORIGINAL_UPLOAD_INTELLIGENCE");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${outputPath}`);
console.log("============================================================");

if (!ready) process.exitCode = 2;
