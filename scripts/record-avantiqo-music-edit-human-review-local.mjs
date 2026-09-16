#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const CONTRACT = "AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_RESULT_V1";
const PREP_CONTRACT = "AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_PREP_V1";
const text = (value) => String(value ?? "").trim();
const arg = (prefix) => text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
const required = (prefix, code) => { const value = arg(prefix); if (!value) throw new Error(code); return value; };
const reviewPath = resolve(required("--review=", "AVANTIQO_MUSIC_EDIT_REVIEW_PATH_REQUIRED"));
const verdict = required("--verdict=", "AVANTIQO_MUSIC_EDIT_VERDICT_REQUIRED").toUpperCase();
if (!["APPROVED", "REJECTED"].includes(verdict)) throw new Error("AVANTIQO_MUSIC_EDIT_VERDICT_INVALID");
const reviewer = required("--reviewer=", "AVANTIQO_MUSIC_EDIT_REVIEWER_REQUIRED");
const notes = arg("--notes=");
const review = JSON.parse(await readFile(reviewPath, "utf8"));
if (review?.contract !== PREP_CONTRACT || review?.waveform_integrity?.preservation_passed !== true || review?.waveform_integrity?.edit_changed_passed !== true || review?.automatic_human_approval_forbidden !== true) {
  throw new Error("AVANTIQO_MUSIC_EDIT_REVIEW_PREP_INVALID");
}
const result = { success: true, contract: CONTRACT, generated_at: new Date().toISOString(), review_path: reviewPath, benchmark_job_id: review.benchmark_job_id,
  capability: "ai.audio.edit", human_review_status: verdict, reviewer, notes: notes || null, technical_integrity_passed: true,
  eligible_for_later_release_decision: verdict === "APPROVED", production_certified: false, production_activation_allowed: false,
  pricing_activation_allowed: false, provider_selection_change_allowed: false, provider_jobs_submitted: 0 };
const outputPath = resolve(arg("--output=") || `/tmp/music-edit-human-review-${review.benchmark_job_id || Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ success: true, contract: CONTRACT, human_review_status: verdict, eligible_for_later_release_decision: result.eligible_for_later_release_decision, output_path: outputPath, production_activation_performed: false }, null, 2));
