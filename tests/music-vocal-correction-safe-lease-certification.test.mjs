import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = "scripts/certify-avantiqo-music-vocal-correction-safe-lease-local.mjs";

async function source() {
  return readFile(path, "utf8");
}

function hasAll(content, markers) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `missing marker: ${marker}`);
  }
}

test("Music vocal correction certification is safe-lease and approval gated", async () => {
  const content = await source();
  hasAll(content, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CERTIFICATION_V1",
    "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    'const SAFE_LEASE_LANE = "music-vocal-correction"',
    "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE",
    "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID",
    "AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT",
    'approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_SPEND_APPROVED")',
    'approved("AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_RIGHTS_APPROVED")',
    'source_role: "isolated_vocal"',
    'job_count_submitted: 1',
    'provider_job_count: 1',
    'status: "PENDING"',
    'automatic_approval_forbidden: true',
    'production_certified: false',
    'production_activation_allowed: false',
    'endpoint_management_performed_by_child: false',
    'direct_workers_max_write_performed_by_child: false',
    'pricing_activation_performed: false',
  ]);
  assert.equal(/rest\.runpod\.io/.test(content), false);
  assert.equal(/workersMax\s*[:=]/.test(content), false);
  assert.equal(/workersMin\s*[:=]/.test(content), false);
});

test("Music correction certification requires technical completion but never auto-certifies human quality", async () => {
  const content = await source();
  hasAll(content, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V2",
    "pitch_correction_complete",
    "phrase_timing_correction_complete",
    "correction_pipeline_complete",
    "human_listening_review_required_for_certification",
    "formant_compensation_explicitly_configured",
    "formant_preservation_claimed",
    '"pitch_naturalness"',
    '"vibrato_preservation"',
    '"timbre_and_formant_naturalness"',
    '"consonant_and_transient_integrity"',
    '"artifact_control"',
    '"timing_naturalness"',
    '"emotional_phrasing_preservation"',
    '"before_after_improvement"',
    '"commercial_readiness"',
  ]);
});
