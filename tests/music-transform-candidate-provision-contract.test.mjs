import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provisioner = await readFile("scripts/provision-avantiqo-music-transform-candidate-runpod-local.mjs", "utf8");
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const launcher = await readFile("scripts/run-avantiqo-music-transform-certification-local.mjs", "utf8");
const policy = await readFile("config/avantiqo-runpod-safe-lease-policy.json", "utf8");

test("Music transform candidate endpoint is distinct from production Compose", () => {
  assert.match(provisioner, /ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1"/);
  assert.match(provisioner, /PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1"/);
  assert.match(provisioner, /production_audio_endpoint_mutation_allowed: false/);
  assert.match(provisioner, /production_audio_endpoint_mutation_performed: false/);
  assert.match(provisioner, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_COLLIDES_WITH_PRODUCTION_AUDIO/);
  assert.match(policy, /"music-transform-candidate": "avantiqo-music-transform-candidate-v1"/);
});

test("Music transform candidate remains parked until Safe Lease opens it", () => {
  assert.match(provisioner, /workersMax: 0/);
  assert.match(provisioner, /workersMin: 0/);
  assert.match(provisioner, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_NOT_PARKED_0_0/);
  assert.match(provisioner, /workers_opened: false/);
  assert.match(provisioner, /provider_job_submitted: false/);
  assert.match(provisioner, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_APPROVED/);
  assert.match(provisioner, /SAFE_LEASE_LANE = "music-transform-candidate"/);
});

test("Candidate template binds the V2 image, shared cache, and certification lane", () => {
  assert.match(provisioner, /IMAGE_EVIDENCE_PATH = "audits\/results\/avantiqo-audio-worker-image.json"/);
  assert.match(provisioner, /REQUEST_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_REQUEST_V11"/);
  assert.match(provisioner, /AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE: SAFE_LEASE_LANE/);
  assert.match(provisioner, /CANONICAL_VOLUME_NAME = "avantiqo-shared-audio-voice-cache"/);
  assert.match(provisioner, /networkVolumeId: volume\.id/);
  assert.match(provisioner, /networkVolumeIds: \[volume\.id\]/);
  assert.match(provisioner, /XL_TURBO_REPAINT_RIGHT_OUTPAINT/);
});

test("Benchmark and launcher can only address the candidate lane", () => {
  assert.match(benchmark, /RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID/);
  assert.doesNotMatch(benchmark, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID/);
  assert.match(benchmark, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.match(launcher, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.doesNotMatch(launcher, /--lane=audio/);
});
