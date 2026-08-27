#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_RESULT_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2";
const CONTINUITY_FIXTURE_CONTRACT = "AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1";
const EXPECTED_CAPABILITY = "ai.audio.extend";
const SAFE_LEASE_LANE = "music-transform-candidate";

const text = (value) => String(value ?? "").trim();
function arg(prefix) { return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)); }
function requiredArg(prefix, code) { const value = arg(prefix); if (!value) throw new Error(code); return value; }

const reportPath = resolve(requiredArg("--report=", "AVANTIQO_MUSIC_TRANSFORM_REVIEW_REPORT_REQUIRED"));
const verdict = requiredArg("--verdict=", "AVANTIQO_MUSIC_TRANSFORM_REVIEW_VERDICT_REQUIRED").toUpperCase();
if (!["APPROVED", "REJECTED"].includes(verdict)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_REVIEW_VERDICT_INVALID");
const reviewer = requiredArg("--reviewer=", "AVANTIQO_MUSIC_TRANSFORM_REVIEWER_REQUIRED");
const notes = arg("--notes=");

const report = JSON.parse(await readFile(reportPath, "utf8"));
if (
  report?.contract !== BENCHMARK_CONTRACT ||
  report?.passed !== true ||
  text(report?.capability) !== EXPECTED_CAPABILITY ||
  report?.provider_jobs_submitted !== 1 ||
  report?.temporal_extension_technical_proven !== true ||
  report?.human_review_required !== true ||
  text(report?.human_review_status) !== "PENDING" ||
  text(report?.human_review_kind) !== "MUSICAL_CONTINUITY" ||
  text(report?.source_mode) !== "MUSICAL_CONTINUITY" ||
  report?.eligible_for_human_release_review !== true ||
  text(report?.source_fixture?.contract) !== CONTINUITY_FIXTURE_CONTRACT ||
  report?.source_fixture?.original_composition !== true ||
  report?.source_fixture?.royalty_free !== true ||
  report?.production_activation_allowed !== false ||
  report?.pricing_activation_allowed !== false ||
  report?.provider_selection_change_allowed !== false ||
  text(report?.safe_lease_lane) !== SAFE_LEASE_LANE ||
  report?.output?.certification_candidate !== true ||
  report?.output?.production_certified !== false ||
  report?.output?.activation_allowed !== false ||
  report?.output?.temporal_extension_observed !== true
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_REPORT_NOT_ELIGIBLE");
}

const result = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  benchmark_contract: BENCHMARK_CONTRACT,
  benchmark_report_path: reportPath,
  capability: EXPECTED_CAPABILITY,
  benchmark_job_id: text(report?.job_id),
  endpoint_id: text(report?.endpoint_id),
  safe_lease_lane: SAFE_LEASE_LANE,
  source_mode: "MUSICAL_CONTINUITY",
  source_fixture_contract: CONTINUITY_FIXTURE_CONTRACT,
  source_fixture_progression: report?.source_fixture?.progression || null,
  source_fixture_final_harmony: report?.source_fixture?.final_harmony || null,
  temporal_extension_technical_proven: true,
  human_review_required: true,
  human_review_kind: "MUSICAL_CONTINUITY",
  human_review_status: verdict,
  reviewer,
  notes: notes || null,
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_change_performed: false,
  eligible_for_later_release_decision: verdict === "APPROVED",
};

const defaultName = `/tmp/music-transform-human-review-${text(report?.job_id) || Date.now()}.json`;
const outputPath = resolve(arg("--output=") || defaultName);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  human_review_kind: "MUSICAL_CONTINUITY",
  human_review_status: verdict,
  eligible_for_later_release_decision: verdict === "APPROVED",
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  output_path: outputPath,
}, null, 2));
