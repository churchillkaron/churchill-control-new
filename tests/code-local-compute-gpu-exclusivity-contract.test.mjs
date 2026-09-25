import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");
const installer = await readFile(new URL("../scripts/local-node/install-avantiqo-node01-workers.ps1", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923134500_local_compute_gpu_exclusivity.sql", import.meta.url), "utf8");
const codePriorityMigration = await readFile(new URL("../supabase/migrations/20260925062715_local_compute_code_priority_gpu_yield.sql", import.meta.url), "utf8");

test("Code uses interactive priority and the worker has a dedicated Code lane with CPU fallback", () => {
  assert.match(provider, /INTERACTIVE_CODE_PRIORITY=90/);
  assert.match(provider, /priority:INTERACTIVE_CODE_PRIORITY/);
  assert.match(installer, /AvantiqoCodeWorker/);
  assert.match(worker, /'gpu','code','cpu','live','training'/);
  assert.match(worker, /if \(\$Lane -eq 'code'\)/);
  assert.match(worker, /runtimeModelAlreadyGpuResident/);
  assert.match(worker, /size_vram -gt 0/);
  assert.match(worker, /\$forceCpu = \(-not \$runtimeModelAlreadyGpuResident\) -and \(\$freeGpuMb -lt \$codeGpuMinFreeMb\)/);
  assert.match(worker, /code_runtime_model_already_gpu_resident/);
  assert.match(worker, /codeGpuMinFreeMb = 1800/);
  assert.match(worker, /runtimeModel -match '1\\\.7b'.*codeGpuMinFreeMb = 3000/s);
  assert.match(worker, /runtimeModel -match '4b'.*codeGpuMinFreeMb = 4300/s);
});

test("central claim compatibility guard prevents old workers from overlapping Code and exclusive GPU jobs", () => {
  assert.match(migration, /v_code_lane_active/);
  assert.match(migration, /j\.workload = 'code_text'/);
  assert.match(migration, /not v_code_lane_active/);
  assert.match(migration, /active\.workload in \(/);
  assert.match(migration, /active\.workload = 'code_text'/);
  assert.match(migration, /image_generate/);
  assert.match(migration, /video_ltx25/);
});


test("exclusive GPU lanes yield the next job boundary to fresh queued Code", () => {
  assert.match(codePriorityMigration, /pg_advisory_xact_lock/);
  assert.match(codePriorityMigration, /v_code_lane_fresh boolean := false/);
  assert.match(codePriorityMigration, /lane_attestations,code,observed_at/);
  assert.match(codePriorityMigration, /interval '90 seconds'/);
  assert.match(codePriorityMigration, /waiting_code\.workload = 'code_text'/);
  assert.match(codePriorityMigration, /waiting_code\.priority >= j\.priority/);
  assert.match(codePriorityMigration, /waiting_code\.status = 'QUEUED'/);
  assert.match(codePriorityMigration, /waiting_code\.available_at <= now\(\)/);
  assert.match(codePriorityMigration, /This never kills\/preempts running media/);
});

test("unified claim migration preserves live front lane and strong-Code media coexistence", () => {
  assert.match(codePriorityMigration, /v_live_claimer boolean := false/);
  assert.match(codePriorityMigration, /j\.lane = 'front' and j\.capability = 'ai\.text\.generate' and v_live_claimer/);
  assert.match(codePriorityMigration, /not \(j\.lane = 'front' and j\.capability = 'ai\.text\.generate'\)/);
  assert.match(codePriorityMigration, /j\.workload = 'code_text'[\s\S]*strong_model_required[\s\S]*image_generate[\s\S]*video_ltx25/);
  assert.match(codePriorityMigration, /active\.workload = 'code_text'[\s\S]*active\.payload->>'strong_model_required'/);
  assert.match(codePriorityMigration, /set search_path = ''/);
  assert.match(codePriorityMigration, /avantiqo_local_node_authorized/);
});
