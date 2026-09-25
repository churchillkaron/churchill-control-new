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

test("strong Code safely reclaims only idle Ollama residency before failing GPU headroom", () => {
  assert.match(worker, /function ReleaseIdleOllamaModelsForStrongCode/);
  assert.match(worker, /if \(-not \$name -or \$name -eq \$TargetModel -or \[int64\]\$entry\.size_vram -le 0\) \{ continue \}/);
  assert.match(worker, /model=\$name; keep_alive=0/);
  assert.match(worker, /\$codeGpuReclaimAttempted = \$true/);
  assert.match(worker, /\$codeGpuReleasedModels = @\(ReleaseIdleOllamaModelsForStrongCode \$runtimeModel\)/);
  assert.match(worker, /\$reclaimDeadline = \(Get-Date\)\.AddSeconds\(12\)/);
  assert.match(worker, /if \(\$forceCpu\) \{ throw 'AVANTIQO_CODE_STRONG_MODEL_GPU_HEADROOM_REQUIRED' \}/);
  assert.doesNotMatch(worker, /ReleaseIdleOllamaModelsForStrongCode[\s\S]{0,1800}StopImageServerForExclusiveGpu/);
});

test("all Ollama text inference is serialized across lanes before residency reclaim", () => {
  assert.match(worker, /function RunTextJobUnlocked\(\$Job\)/);
  assert.match(worker, /Global\\AvantiqoNode01OllamaTextGpu/);
  assert.match(worker, /\$mutex\.WaitOne\(\[TimeSpan\]::FromSeconds\(\$waitSeconds\)\)/);
  assert.match(worker, /if \(-not \$held\) \{ throw 'AVANTIQO_OLLAMA_TEXT_GPU_MUTEX_TIMEOUT' \}/);
  assert.match(worker, /RunTextJobUnlocked \$Job/);
  assert.match(worker, /\$mutex\.ReleaseMutex\(\)/);
});

test("Code metrics expose bounded GPU reclaim evidence", () => {
  assert.match(worker, /code_gpu_reclaim_attempted=\[bool\]\$codeGpuReclaimAttempted/);
  assert.match(worker, /code_gpu_reclaim_wait_ms=\[int\]\$codeGpuReclaimWaitMs/);
  assert.match(worker, /code_gpu_released_model_count=@\(\$codeGpuReleasedModels\)\.Count/);
});


test("dedicated Code and live lanes poll sub-second while media lanes keep conservative idle polling", () => {
  assert.match(worker, /if \(\$Lane -eq 'code' -or \$Lane -eq 'live'\)/);
  assert.match(worker, /\$pollSleepMilliseconds = \$\(if \(\$jobs\.Count -gt 0\) \{ 250 \} else \{ 750 \}\)/);
  assert.match(worker, /Start-Sleep -Milliseconds \$pollSleepMilliseconds/);
  assert.match(worker, /\$pollSleepSeconds = \$\(if \(\$jobs\.Count -gt 0\) \{ 1 \} else \{ 5 \}\)/);
  assert.match(worker, /Start-Sleep -Seconds \$pollSleepSeconds/);
});
