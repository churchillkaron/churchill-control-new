import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STATUS = new URL(
  "../scripts/diagnose-avantiqo-owned-media-certification.mjs",
  import.meta.url,
);

test("owned media certification diagnostics are read-only and classify all campaign states", async () => {
  const source = await readFile(STATUS, "utf8");

  assert.match(source, /AVANTIQO_OWNED_MEDIA_CERTIFICATION_STATUS_V1/);
  assert.match(source, /ai\.image\.generate/);
  assert.match(source, /ai\.video\.lipsync/);
  assert.match(source, /status: "MISSING"/);
  assert.match(source, /status: "FAILED"/);
  assert.match(source, /"PASSED" : "STALE"/);
  assert.match(source, /ready_for_human_quality_review/);
  assert.match(source, /next_retry_capabilities/);
  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY=/);
  assert.match(source, /network_requests_performed: 0/);
  assert.match(source, /runpod_jobs_submitted: 0/);
  assert.match(source, /fixture_generation_performed: false/);
  assert.match(source, /storage_mutations_performed: 0/);
  assert.match(source, /production_activation_performed: false/);
  assert.match(source, /pricing_activation_performed: false/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /runsync/);
  assert.doesNotMatch(source, /\/run\b/);
});

test("owned media diagnostics fail stale when evidence bindings or economics drift", async () => {
  const source = await readFile(STATUS, "utf8");

  assert.match(source, /BENCHMARK_DEFINITION_BINDING_MISSING/);
  assert.match(source, /FIXTURE_FINGERPRINT_MISSING/);
  assert.match(source, /RETURNED_MODEL_BINDING_INVALID/);
  assert.match(source, /OUTPUT_PROVENANCE_BINDING_INVALID/);
  assert.match(source, /GPU_RATE_CHANGED_SINCE_MEASUREMENT/);
  assert.match(source, /ECONOMICS_MEASUREMENT_MISSING/);
  assert.match(source, /UNEXPECTED_PRODUCTION_CERTIFICATION_STATE/);
});
