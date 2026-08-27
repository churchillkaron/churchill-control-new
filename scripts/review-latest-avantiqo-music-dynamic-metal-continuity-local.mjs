#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const TMP = "/tmp";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2";
const CONTINUITY_CONTRACT = "AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1";
const METAL_PROFILE_CONTRACT = "AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_V1";
const REVIEW_SCRIPT = resolve("scripts/review-avantiqo-music-transform-certification-local.mjs");
const RECORD_SCRIPT = resolve("scripts/record-avantiqo-music-transform-human-review-local.mjs");

const text = (value) => String(value ?? "").trim();
function arg(prefix) { return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)); }

function eligible(report) {
  return (
    report?.contract === BENCHMARK_CONTRACT &&
    report?.passed === true &&
    text(report?.capability) === "ai.audio.extend" &&
    report?.provider_jobs_submitted === 1 &&
    report?.temporal_extension_technical_proven === true &&
    report?.human_review_required === true &&
    text(report?.human_review_status) === "PENDING" &&
    text(report?.human_review_kind) === "MUSICAL_CONTINUITY" &&
    text(report?.source_mode) === "MUSICAL_CONTINUITY" &&
    report?.eligible_for_human_release_review === true &&
    text(report?.source_fixture?.contract) === CONTINUITY_CONTRACT &&
    text(report?.source_fixture?.profile) === "DYNAMIC_METAL" &&
    text(report?.source_fixture?.profile_contract) === METAL_PROFILE_CONTRACT &&
    report?.source_fixture?.original_composition === true &&
    report?.source_fixture?.royalty_free === true &&
    report?.source_fixture?.reference_recording_used === false &&
    report?.source_fixture?.artist_imitation_requested === false &&
    report?.production_activation_allowed === false &&
    report?.pricing_activation_allowed === false &&
    report?.provider_selection_change_allowed === false &&
    text(report?.safe_lease_lane) === "music-transform-candidate" &&
    report?.output?.certification_candidate === true &&
    report?.output?.production_certified === false &&
    report?.output?.activation_allowed === false &&
    report?.output?.temporal_extension_observed === true
  );
}

const candidates = [];
for (const name of await readdir(TMP)) {
  if (!/^music-transform-.*\.json$/i.test(name)) continue;
  const path = resolve(TMP, name);
  try {
    const report = JSON.parse(await readFile(path, "utf8"));
    if (!eligible(report)) continue;
    const fileStat = await stat(path);
    candidates.push({ path, report, mtimeMs: fileStat.mtimeMs });
  } catch {
    // Ignore unrelated or incomplete temporary JSON files.
  }
}

candidates.sort((a, b) => {
  const aGenerated = Date.parse(text(a.report?.generated_at));
  const bGenerated = Date.parse(text(b.report?.generated_at));
  if (Number.isFinite(aGenerated) && Number.isFinite(bGenerated) && aGenerated !== bGenerated) {
    return bGenerated - aGenerated;
  }
  return b.mtimeMs - a.mtimeMs;
});

const selected = candidates[0];
if (!selected) {
  throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_ELIGIBLE_REPORT_NOT_FOUND");
}

const recordApproved = process.argv.includes("--record-approved");
const reviewer = arg("--reviewer=");
const notes = arg("--notes=");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_REVIEW_LATEST_V1",
  benchmark_report_path: selected.path,
  benchmark_job_id: text(selected.report?.job_id),
  source_profile: text(selected.report?.source_fixture?.profile),
  source_profile_contract: text(selected.report?.source_fixture?.profile_contract),
  temporal_extension_technical_proven: true,
  human_review_status: recordApproved ? "APPROVAL_RECORD_REQUESTED" : "PENDING",
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
}, null, 2));

if (recordApproved) {
  if (!reviewer) throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_REVIEWER_REQUIRED");
  const args = [
    RECORD_SCRIPT,
    `--report=${selected.path}`,
    "--verdict=APPROVED",
    `--reviewer=${reviewer}`,
  ];
  if (notes) args.push(`--notes=${notes}`);
  const child = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_APPROVAL_RECORD_FAILED:exit=${child.status ?? "UNKNOWN"}`);
  }
  console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_HUMAN_REVIEW=APPROVED");
  console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_RELEASE_DECISION=PENDING");
} else {
  const child = spawnSync(
    process.execPath,
    [REVIEW_SCRIPT, `--report=${selected.path}`],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_REVIEW_OPEN_FAILED:exit=${child.status ?? "UNKNOWN"}`);
  }
}
