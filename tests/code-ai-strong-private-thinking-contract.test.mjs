import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const worker = await readFile("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");

test("strong owned Code explicitly requests private thinking while fast Code does not", () => {
  assert.match(provider, /think:strongModelRequired,strong_model_required:strongModelRequired/);
  assert.match(worker, /\[string\]\$Job\.lane -eq 'code'\) -and \$strongCodeModelRequired -and \[bool\]\$payload\.think/);
  assert.match(worker, /\[string\]\$Job\.lane -eq 'deep'/);
});

test("private model thinking is never persisted as Code output", () => {
  assert.match(worker, /\$text = \[string\]\$raw\.message\.content/);
  assert.doesNotMatch(worker, /\$raw\.message\.thinking/);
  assert.match(worker, /raw_reasoning_persisted=\$false/);
  assert.match(worker, /private_thinking_enabled=\[bool\]\$body\.think/);
});

test("strong Code private thinking remains local and bounded by the existing output budget", () => {
  assert.match(provider, /AVANTIQO_CODE_STRONG_MODEL\|\|"qwen3:4b-instruct"/);
  assert.match(provider, /max_output_tokens:Math\.min\(Number\(input\.max_output_tokens\|\|4096\),4096\)/);
  assert.match(worker, /if \(\$strongCodeModelRequired\) \{ \$codeGpuMinFreeMb = \[Math\]::Max\(4300, \$codeGpuMinFreeMb\) \}/);
  assert.doesNotMatch(provider, /openai|anthropic|gemini/i);
});
