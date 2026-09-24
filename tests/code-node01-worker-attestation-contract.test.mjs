import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const refresh = await readFile("scripts/local-node/refresh-avantiqo-node01-code-worker.ps1", "utf8");
const verify = await readFile("scripts/verify-avantiqo-node01-code-worker-attestation-local.mjs", "utf8");

test("Node01 Code worker advertises exact source attestation in lane heartbeats", () => {
  assert.match(worker, /AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE/);
  assert.match(worker, /Get-FileHash -Algorithm SHA256 \$PSCommandPath/);
  assert.match(worker, /worker_contract=\$WorkerContract/);
  assert.match(worker, /worker_source_sha256=\$WorkerSourceSha256/);
  assert.match(worker, /heartbeat_source_lane=\$Lane/);
});

test("Code-only refresh requires explicit approval and does not restart non-Code lanes", () => {
  assert.match(refresh, /ApproveCodeLaneRestart/);
  assert.match(refresh, /AVANTIQO_CODE_LANE_RESTART_APPROVAL_REQUIRED/);
  assert.match(refresh, /Get-FileHash -Algorithm SHA256/);
  assert.match(refresh, /\\AvantiqoCodeWorker/);
  assert.match(refresh, /schtasks\.exe \/End/);
  assert.match(refresh, /code_lane_restarted = \$true/);
  assert.match(refresh, /gpu_lane_restarted = \$false/);
  assert.match(refresh, /live_lane_restarted = \$false/);
});

test("local attestation verifier accepts a fresh durable Code-lane attestation even when another lane heartbeats last", () => {
  assert.match(verify, /lane_attestations/);
  assert.match(verify, /codeAttestation/);
  assert.match(verify, /durableCodeFresh/);
  assert.match(verify, /heartbeat_source_lane/);
  assert.match(verify, /toLowerCase\(\) === "code"/);
  assert.match(verify, /worker_source_sha256/);
  assert.match(verify, /AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE/);
  assert.match(verify, /Date\.now\(\) - codeAttestationAt <= 90000/);
});

test("heartbeat migration preserves per-lane attestations instead of replacing them", async () => {
  const migration = await readFile("supabase/migrations/20260924062842_preserve_local_compute_lane_attestations.sql", "utf8");
  assert.match(migration, /lane_attestations/);
  assert.match(migration, /jsonb_build_object\(v_lane, v_lane_attestation\)/);
  assert.match(migration, /v_existing_metadata\s*\|\|\s*coalesce\(p_metadata/);
  assert.match(migration, /worker_source_sha256/);
  assert.match(migration, /observed_at/);
});
