import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const workflow = read(".github/workflows/avantiqo-music-certification.yml");
const request = JSON.parse(read("audits/avantiqo-music-certification-request.json"));
const benchmark = read("scripts/benchmark-avantiqo-music.mjs");

test("Music certification workflow requires explicit V2 spend and Safe Lease authorization", () => {
  assert.match(workflow, /request\.contract === "AVANTIQO_MUSIC_CERTIFICATION_REQUEST_V2"/);
  assert.match(workflow, /request\.provider_spend_approved === true/);
  assert.match(workflow, /request\.safe_lease_contract === "AVANTIQO_RUNPOD_SAFE_LEASE_V2"/);
  assert.match(workflow, /request\.safe_lease_lane === "audio"/);
  assert.match(workflow, /request\.max_provider_jobs === 1/);
  assert.match(workflow, /request\.benchmark_runs === 1/);
  assert.match(workflow, /request\.synthetic_organization_only === true/);
  assert.match(workflow, /request\.production_activation_allowed === false/);
  assert.match(workflow, /request\.pricing_activation_allowed === false/);
  assert.match(workflow, /request\.provider_selection_change_allowed === false/);
  assert.match(workflow, /request\.human_review_required === true/);
  assert.match(workflow, /request\.automatic_human_review_approved === false/);
});

test("checked-in V1 Music request stays deliberately inert", () => {
  assert.equal(request.contract, "AVANTIQO_MUSIC_CERTIFICATION_REQUEST_V1");
  assert.equal(request.scope, "music-only");
  assert.equal(request.benchmark_runs, 1);
  assert.equal(request.production_activation_allowed, false);
  assert.equal(Object.hasOwn(request, "provider_spend_approved"), false);
  assert.equal(Object.hasOwn(request, "safe_lease_contract"), false);
  assert.equal(Object.hasOwn(request, "safe_lease_lane"), false);
  assert.equal(Object.hasOwn(request, "max_provider_jobs"), false);
});

test("Music certification benchmark can only run as the Safe Lease audio child", () => {
  assert.match(workflow, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
  assert.match(workflow, /--lane=audio/);
  assert.match(workflow, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED:\s*"YES"/);
  assert.match(workflow, /AVANTIQO_AUDIO_BENCHMARK_RUNS:\s*"1"/);
  assert.match(workflow, /node scripts\/benchmark-avantiqo-music\.mjs/);

  const leaseIndex = workflow.indexOf("run-avantiqo-runpod-safe-lease-v2-local.mjs");
  const benchmarkIndex = workflow.indexOf("node scripts/benchmark-avantiqo-music.mjs");
  assert.ok(leaseIndex >= 0 && benchmarkIndex > leaseIndex);

  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_LANE/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  assert.match(benchmark, /AVANTIQO_MUSIC_BENCHMARK_SAFE_LEASE_ONE_JOB_REQUIRED/);
});

test("Music certification remains economics and human-review gated", () => {
  assert.match(workflow, /avantiqo-music-economics\.mjs/);
  assert.match(workflow, /prepare-avantiqo-music-human-review\.mjs/);
  assert.match(workflow, /review\.review_status !== "PENDING"/);
  assert.match(workflow, /review\.automatic_human_approval_forbidden !== true/);
  assert.match(workflow, /economics\.pricing_activation_performed !== false/);
  assert.match(workflow, /economics\.provider_selection_changed !== false/);
  assert.match(workflow, /economics\.production_deploy_performed !== false/);
  assert.match(workflow, /review\.activation_allowed !== false/);
});
