import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preparePath = "scripts/prepare-avantiqo-music-vocal-correction-human-review.mjs";
const recordPath = "scripts/record-avantiqo-music-vocal-correction-human-review-local.mjs";

async function sources() { return Promise.all([readFile(preparePath, "utf8"), readFile(recordPath, "utf8")]); }
function hasAll(content, markers) { for (const marker of markers) assert.ok(content.includes(marker), `missing marker: ${marker}`); }

test("Music vocal correction certification remains explicit human-review gated", async () => {
  const [prepare, record] = await sources();
  hasAll(prepare, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_V2",
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2",
    'review_status: "PENDING"',
    'automatic_score_generation_forbidden: true',
    'automatic_approval_forbidden: true',
    'activation_allowed: false',
    'production_certified: false',
  ]);
  hasAll(record, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_RESULT_V1",
    'if (!["APPROVED", "REJECTED"].includes(verdict))',
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEWER_REQUIRED",
    'minimum_each_criterion: threshold',
    'const threshold = 92',
    'production_activation_allowed: false',
    'provider_jobs_submitted: 0',
  ]);
});

test("Music correction review checks technical completion and never invents formant certification", async () => {
  const [prepare, record] = await sources();
  hasAll(prepare, [
    "pitch_correction_complete",
    "phrase_timing_correction_complete",
    "correction_pipeline_complete",
    'formant_preservation_claimed: false',
    'id: "pitch_naturalness"',
    'id: "vibrato_preservation"',
    'id: "timbre_and_formant_naturalness"',
    'id: "artifact_control"',
    'id: "timing_naturalness"',
    'id: "commercial_readiness"',
  ]);
  assert.match(record, /formant_preservation_claimed !== false/);
});
