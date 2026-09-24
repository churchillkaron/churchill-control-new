import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");
const installer = await readFile(new URL("../scripts/local-node/install-avantiqo-node01-workers.ps1", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923134500_local_compute_gpu_exclusivity.sql", import.meta.url), "utf8");

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
