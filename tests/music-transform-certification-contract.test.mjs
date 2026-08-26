import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile("services/avantiqo-audio-engine/handler.py", "utf8");
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const launcher = await readFile("scripts/run-avantiqo-music-transform-certification-local.mjs", "utf8");

test("Music transform candidate certification stays separate from production certification", () => {
  assert.match(worker, /CERTIFICATION_JOB_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1"/);
  assert.match(worker, /CERTIFICATION_CANDIDATE_CAPABILITIES = \{/);
  assert.match(worker, /"ai\.audio\.remix"/);
  assert.match(worker, /"ai\.audio\.edit"/);
  assert.match(worker, /production_activation_allowed/);
  assert.match(worker, /pricing_activation_allowed/);
  assert.match(worker, /provider_selection_change_allowed/);
  assert.match(worker, /automatic_human_review_approved/);
  assert.match(worker, /"production_certified": False/);
  assert.match(worker, /"activation_allowed": False/);
});

test("Music transform benchmark requires one Safe Lease audio job and explicit approvals", () => {
  assert.match(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(benchmark, /SAFE_LEASE_LANE = "audio"/);
  assert.match(benchmark, /max_provider_jobs: 1/);
  assert.match(benchmark, /benchmark_runs: 1/);
  assert.match(benchmark, /human_review_required: true/);
  assert.match(benchmark, /automatic_human_review_approved: false/);
  assert.match(benchmark, /production_activation_allowed: false/);
  assert.match(benchmark, /pricing_activation_allowed: false/);
  assert.match(benchmark, /provider_selection_change_allowed: false/);
  assert.match(benchmark, /provider_jobs_submitted: 1/);
  assert.doesNotMatch(benchmark, /workersMax\s*:/);
  assert.doesNotMatch(benchmark, /workersMin\s*:/);
});

test("Music transform launcher uses Safe Lease audio and cannot bypass approval gates", () => {
  assert.match(launcher, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(launcher, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/);
  assert.match(launcher, /--lane=audio/);
  assert.match(launcher, /--ttl-ms=1800000/);
  assert.match(launcher, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES"/);
  assert.match(launcher, /MAX_PROVIDER_JOBS=1/);
  assert.match(launcher, /HUMAN_REVIEW_REQUIRED=true/);
  assert.match(launcher, /PRODUCTION_ACTIVATION=false/);
  assert.match(launcher, /PRICING_ACTIVATION=false/);
  assert.match(launcher, /PROVIDER_SELECTION_CHANGE=false/);
  assert.doesNotMatch(launcher, /\/run["'`]/);
  assert.doesNotMatch(launcher, /workersMax\s*:/);
  assert.doesNotMatch(launcher, /workersMin\s*:/);
});
