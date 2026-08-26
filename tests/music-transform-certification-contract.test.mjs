import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile("services/avantiqo-audio-engine/handler.py", "utf8");
const workerV2 = await readFile("services/avantiqo-audio-engine/handler_v2.py", "utf8");
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const launcher = await readFile("scripts/run-avantiqo-music-transform-certification-local.mjs", "utf8");
const safeLeasePolicy = await readFile("config/avantiqo-runpod-safe-lease-policy.json", "utf8");

test("Music transform candidate certification stays separate from production certification", () => {
  assert.match(worker, /CERTIFICATION_JOB_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1"/);
  assert.match(worker, /AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE/);
  assert.match(worker, /CERTIFICATION_CANDIDATE_CAPABILITIES = \{/);
  assert.match(worker, /"ai\.audio\.remix"/);
  assert.match(worker, /"ai\.audio\.edit"/);
  assert.match(workerV2, /base\.CERTIFICATION_CANDIDATE_CAPABILITIES\.add\(TEMPORAL_EXTEND_CAPABILITY\)/);
  assert.match(workerV2, /TEMPORAL_EXTEND_CAPABILITY = "ai\.audio\.extend"/);
  assert.match(worker, /production_activation_allowed/);
  assert.match(worker, /pricing_activation_allowed/);
  assert.match(worker, /provider_selection_change_allowed/);
  assert.match(worker, /automatic_human_review_approved/);
  assert.match(workerV2, /"production_certified": certification_access\.get\("production_certified"\) is True/);
  assert.match(workerV2, /"activation_allowed": certification_access\.get\("activation_allowed"\) is True/);
  assert.match(safeLeasePolicy, /"music-transform-candidate": "avantiqo-music-transform-candidate-v1"/);
  assert.match(safeLeasePolicy, /"audio": "avantiqo-audio-v1"/);
});

test("Music transform benchmark requires one dedicated candidate Safe Lease job and explicit approvals", () => {
  assert.match(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(benchmark, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.match(benchmark, /RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID/);
  assert.doesNotMatch(benchmark, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID/);
  assert.match(benchmark, /endpoint_scope: "MUSIC_TRANSFORM_CANDIDATE_ONLY"/);
  assert.match(benchmark, /production_audio_endpoint_allowed: false/);
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

test("Music Extend benchmark proves a longer output before technical certification", () => {
  assert.match(benchmark, /"ai\.audio\.extend"/);
  assert.match(benchmark, /extension_seconds: EXTEND_SECONDS/);
  assert.match(benchmark, /continuity_overlap_seconds: EXTEND_OVERLAP_SECONDS/);
  assert.match(benchmark, /text\(output\.task_type\) === "repaint"/);
  assert.match(benchmark, /XL_TURBO_REPAINT_RIGHT_OUTPAINT/);
  assert.match(benchmark, /Number\(output\.repainting_end\) > Number\(output\.source_duration_seconds\)/);
  assert.match(benchmark, /Number\(output\.duration_seconds\) > Number\(output\.source_duration_seconds\) \+ 1/);
  assert.match(benchmark, /output\.temporal_extension_observed === true/);
  assert.match(benchmark, /temporal_extension_technical_proven: temporalExtensionTechnicalProven/);
  assert.match(benchmark, /human_review_status: "PENDING"/);
});

test("Music transform launcher uses dedicated candidate Safe Lease and cannot bypass approval gates", () => {
  assert.match(launcher, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(launcher, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/);
  assert.match(launcher, /RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID/);
  assert.match(launcher, /"ai\.audio\.extend"/);
  assert.match(launcher, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.match(launcher, /--lane=\$\{SAFE_LEASE_LANE\}/);
  assert.doesNotMatch(launcher, /--lane=audio/);
  assert.match(launcher, /--ttl-ms=1800000/);
  assert.match(launcher, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES"/);
  assert.match(launcher, /ENDPOINT_SCOPE=MUSIC_TRANSFORM_CANDIDATE_ONLY/);
  assert.match(launcher, /PRODUCTION_AUDIO_ENDPOINT_ALLOWED=false/);
  assert.match(launcher, /MAX_PROVIDER_JOBS=1/);
  assert.match(launcher, /HUMAN_REVIEW_REQUIRED=true/);
  assert.match(launcher, /PRODUCTION_ACTIVATION=false/);
  assert.match(launcher, /PRICING_ACTIVATION=false/);
  assert.match(launcher, /PROVIDER_SELECTION_CHANGE=false/);
  assert.match(launcher, /TEMPORAL_EXTEND_STRATEGY=XL_TURBO_REPAINT_RIGHT_OUTPAINT/);
  assert.match(launcher, /LONGER_OUTPUT_REQUIRED=true/);
  assert.doesNotMatch(launcher, /\/run["'`]/);
  assert.doesNotMatch(launcher, /workersMax\s*:/);
  assert.doesNotMatch(launcher, /workersMin\s*:/);
});
