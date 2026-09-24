import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");
const installer = await readFile(new URL("../scripts/local-node/install-avantiqo-node01-workers.ps1", import.meta.url), "utf8");

test("Node01 gives Code an independent responsive worker lane", () => {
  assert.match(worker, /ValidateSet\('supervisor','gpu','code','cpu','live','training'\)/);
  assert.match(worker, /foreach \(\$childLane in @\('gpu','code','cpu','live','training'\)\)/);
  assert.match(worker, /\$CodeCapabilities = @\([^\n]*'ai\.code\.debug'[^\n]*\)/);
  assert.match(worker, /elseif \(\$Lane -eq 'code'\) \{ \$CodeCapabilities \}/);
  assert.doesNotMatch(worker, /\$GpuCapabilities = @\([^\n]*'ai\.code\.debug'/);
  assert.match(installer, /\\AvantiqoCodeWorker/);
  assert.match(installer, /-Lane code/);
});

test("Code lane preserves strong-model quality while retaining lightweight CPU fallback", () => {
  assert.match(worker, /--query-gpu=memory\.free/);
  assert.match(worker, /\$freeGpuMb -lt \$codeGpuMinFreeMb/);
  assert.match(worker, /code_gpu_min_free_vram_mb=@\{ fast=1800; interactive=3000; strong=4300 \}/);
  assert.match(worker, /\$strongCodeModelRequired = \$false/);
  assert.match(worker, /\$gpuWaitDeadline = \(Get-Date\)\.AddSeconds\(45\)/);
  assert.match(worker, /AVANTIQO_CODE_STRONG_MODEL_GPU_HEADROOM_REQUIRED/);
  assert.match(worker, /-not \$strongCodeModelRequired/);
  assert.match(worker, /\$runtimeModel = \$CodeCpuFallbackModel/);
  assert.match(worker, /\$body\.options\.num_gpu = 0/);
  assert.match(worker, /code_gpu_strong_model='qwen3:4b-instruct'/);
  assert.match(worker, /code_gpu_interactive_model='qwen3:1\.7b'/);
  assert.match(worker, /code_cpu_fallback_model=\$CodeCpuFallbackModel/);
  assert.match(worker, /code_gpu_min_free_vram_mb=@\{ fast=1800; interactive=3000; strong=4300 \}/);
  assert.match(worker, /code_cpu_timeout_seconds=90/);
  assert.match(worker, /code_gpu_timeout_seconds=120/);
  assert.match(worker, /Interactive Code must remain available even when GPU telemetry is unavailable/);
});
