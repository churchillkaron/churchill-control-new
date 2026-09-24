import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const planner = await readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");

test("Node01 Code scheduler uses model-aware GPU headroom", () => {
  assert.match(worker, /qwen3:0\.6b/);
  assert.match(worker, /codeGpuMinFreeMb = 1800/);
  assert.match(worker, /runtimeModel -match '1\\\.7b'.*codeGpuMinFreeMb = 3000/s);
  assert.match(worker, /runtimeModel -match '4b'.*codeGpuMinFreeMb = 4300/s);
  assert.match(worker, /strongCodeModelRequired.*Max\(4300, \$codeGpuMinFreeMb\)/s);
  assert.match(worker, /freeGpuMb -lt \$codeGpuMinFreeMb/);
});

test("interactive discovery has bounded output while strong mutation keeps caller budget", () => {
  assert.match(worker, /-not \$strongCodeModelRequired -and -not \$liveConversation/);
  assert.match(worker, /\$numPredict = \[Math\]::Min\(\$numPredict, 1024\)/);
});

test("interactive Code waits briefly for GPU before expensive CPU fallback", () => {
  assert.match(worker, /interactiveGpuWaitDeadline = \$interactiveGpuWaitStarted\.AddSeconds\(10\)/);
  assert.match(worker, /-not \$strongCodeModelRequired[\s\S]*\$runtimeModel -match '1\\\.7b'/);
  assert.match(worker, /code_gpu_wait_ms=\[int\]\$codeGpuWaitMs/);
  assert.match(worker, /code_cpu_fallback=\[bool\]\$forceCpu/);
});

test("strong Code rechecks requested-model residency during GPU wait before failing headroom", () => {
  assert.match(worker, /\$gpuWaitDeadline = \(Get-Date\)\.AddSeconds\(45\)/);
  assert.match(worker, /Invoke-RestMethod -Uri "\$OllamaUrl\/api\/ps"/);
  assert.match(worker, /\$residentModel\.Count -gt 0/);
  assert.match(worker, /\$runtimeModelAlreadyGpuResident = \$true/);
  assert.match(worker, /\$forceCpu = \$false/);
  assert.match(worker, /AVANTIQO_CODE_STRONG_MODEL_GPU_HEADROOM_REQUIRED/);
});

test("Code inference timeout is bounded and not blindly retried by worker", () => {
  assert.match(worker, /forceCpu\) \{ 90 \} else \{ 120 \}/);
  assert.match(worker, /AVANTIQO_CODE_OLLAMA_TIMEOUT/);
  assert.match(worker, /\$retryable = \$false/);
  assert.match(planner, /AVANTIQO_CODE_OLLAMA_TIMEOUT/);
  assert.match(planner, /AVANTIQO_CODE_STRONG_MODEL_GPU_HEADROOM_REQUIRED/);
});
