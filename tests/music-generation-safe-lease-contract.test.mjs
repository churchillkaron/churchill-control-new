import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("raw Music benchmark requires Safe Lease V2 audio lane and one job", async () => {
  const text = await source("scripts/benchmark-avantiqo-music.mjs");
  assert.match(text, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(text, /SAFE_LEASE_LANE\s*=\s*["']audio["']/);
  assert.match(text, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(text, /AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID/);
  assert.match(text, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  assert.match(text, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(text, /AVANTIQO_MUSIC_BENCHMARK_SAFE_LEASE_ONE_JOB_REQUIRED/);
  assert.match(text, /max_provider_jobs:\s*1/);
});

test("controlled and local Music certification wrappers use Safe Lease audio", async () => {
  const controlled = await source("scripts/run-avantiqo-music-controlled-benchmark-local.mjs");
  const local = await source("scripts/certify-avantiqo-music-local.sh");

  for (const text of [controlled, local]) {
    assert.match(text, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
    assert.match(text, /--lane=audio/);
    assert.match(text, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED/);
    assert.match(text, /AVANTIQO_AUDIO_BENCHMARK_RUNS(?:=|:\s*)["']?1/);
  }
});

test("GitHub Music certification requires an explicit V2 request before spend", async () => {
  const workflow = await source(".github/workflows/avantiqo-music-certification.yml");
  const request = JSON.parse(await source("audits/avantiqo-music-certification-request.json"));

  assert.match(workflow, /AVANTIQO_MUSIC_CERTIFICATION_REQUEST_V2/);
  assert.match(workflow, /provider_spend_approved === true/);
  assert.match(workflow, /safe_lease_contract === "AVANTIQO_RUNPOD_SAFE_LEASE_V2"/);
  assert.match(workflow, /safe_lease_lane === "audio"/);
  assert.match(workflow, /max_provider_jobs === 1/);
  assert.match(workflow, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
  assert.match(workflow, /--lane=audio/);

  assert.equal(request.contract, "AVANTIQO_MUSIC_CERTIFICATION_REQUEST_V1");
  assert.notEqual(request.provider_spend_approved, true);
  assert.notEqual(request.safe_lease_contract, "AVANTIQO_RUNPOD_SAFE_LEASE_V2");
});

test("legacy Music capacity repair and endpoint migration stay deprecated", async () => {
  const unblock = await source("scripts/unblock-avantiqo-music-generation-job-live-local.mjs");
  const migration = await source("scripts/migrate-avantiqo-audio-runpod-to-registry-endpoint-local.mjs");

  assert.match(unblock, /CAPACITY_UNBLOCK_DEPRECATED/);
  assert.match(unblock, /DIRECT_MUSIC_RUNPOD_CAPACITY_REPAIR_FORBIDDEN/);
  assert.match(unblock, /resting_workers_max:\s*0/);
  assert.doesNotMatch(unblock, /method:\s*["']PATCH["']/);

  assert.match(migration, /REGISTRY_ENDPOINT_MIGRATION_DEPRECATED/);
  assert.match(migration, /LEGACY_ENDPOINT_REPLACEMENT_FORBIDDEN/);
  assert.match(migration, /resting_workers_max:\s*0/);
  assert.doesNotMatch(migration, /workersMax:\s*1/);
  assert.doesNotMatch(migration, /method:\s*["']POST["']/);
  assert.doesNotMatch(migration, /method:\s*["']PATCH["']/);
});
