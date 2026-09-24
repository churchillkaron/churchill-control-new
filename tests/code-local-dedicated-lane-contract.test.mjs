import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");

test("interactive Code jobs use the dedicated code lane rather than the shared gpu lane", () => {
  assert.match(provider, /AVANTIQO_CODE_INTERACTIVE_MODEL\|\|"qwen3:1\.7b"/);
  assert.match(provider, /lane:"code",workload:"code_text"/);
  assert.doesNotMatch(provider, /lane:"gpu",workload:"code_text"/);
  assert.match(worker, /worker_lanes=@\('gpu','code','cpu','live','training'\)/);
});

test("Code text uses safe GPU headroom and falls back to CPU without blocking creative workloads", () => {
  assert.match(worker, /if \(\$workload -eq 'code_text'\).*class='interactive_hybrid'.*gpu_vram_mb=4300.*LOCAL_QWEN4B_GPU_STRONG_MUTATION_QWEN17B_INTERACTIVE_QWEN06B_DISCOVERY_CPU_FALLBACK/);
  assert.match(worker, /\$CodeCpuFallbackModel = 'qwen3:0\.6b'/);
  assert.match(worker, /\$Lane -eq 'code'.*\$forceCpu.*\$Job\.capability -eq 'ai\.code\.debug'/s);
  assert.match(worker, /\$runtimeModel = \$CodeCpuFallbackModel/);
  assert.match(worker, /\$forceCpu = \$false/);
  assert.match(worker, /--query-gpu=memory\.free/);
  assert.match(worker, /\$freeGpuMb -lt \$codeGpuMinFreeMb/);
  assert.match(worker, /codeGpuMinFreeMb = 1800/);
  assert.match(worker, /runtimeModel -match '1\\\.7b'.*codeGpuMinFreeMb = 3000/s);
  assert.match(worker, /runtimeModel -match '4b'.*codeGpuMinFreeMb = 4300/s);
  assert.match(worker, /\$body\.options\.num_gpu = 0/);
  assert.match(worker, /\$ollamaTimeoutSeconds = \$\(if \(\$Lane -eq 'code' -and \$forceCpu\) \{ 90 \} else \{ 120 \}\)/);
});

test("Code context window is prompt-aware instead of fixed at 8192", () => {
  assert.match(worker, /\$messageChars =/);
  assert.match(worker, /\$codeContextTokens = 4096/);
  assert.match(worker, /\$messageChars -gt 15000.*\$codeContextTokens = 6144/);
  assert.match(worker, /elseif \(\$Lane -eq 'code'\) \{ \$codeContextTokens \}/);
  assert.match(worker, /context_tokens=\[int\]\$body\.options\.num_ctx/);
  assert.match(worker, /message_chars=\[int64\]\$messageChars/);
  assert.doesNotMatch(worker, /elseif \(\$Lane -eq 'code'\) \{ 8192 \}/);
});
