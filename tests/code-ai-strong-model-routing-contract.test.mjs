import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");
const frontier = await readFile("scripts/run-avantiqo-code-frontier-local.mjs", "utf8");

test("frontier benchmark review is explicitly routed to the strong owned Code model", () => {
  assert.match(frontier, /capability: "ai\.code\.review"/);
  assert.match(frontier, /benchmark_only: true/);
  assert.match(frontier, /benchmark_contract: CONTRACT/);
  assert.match(provider, /metadata=object\(input\.metadata\)/);
  assert.match(provider, /metadata\.benchmark_only===true/);
  assert.match(provider, /benchmark_contract\)\.startsWith\("AVANTIQO_CODE_"\)/);
  assert.match(provider, /if\(benchmarkStrong\)return true/);
  assert.match(provider, /const runtimeModel=strongModelRequired\?STRONG_MODEL:MODEL/);
});

test("invention and substantive review refactor test work use strong tier without promoting trivial edits", () => {
  assert.match(provider, /if\(capability==="ai\.code\.invent"\)return true/);
  assert.match(provider, /new Set\(\["ai\.code\.debug","ai\.code\.review","ai\.code\.refactor","ai\.code\.test"\]\)\.has\(capability\)&&substantive/);
  assert.match(provider, /spec\.implementation_required===true/);
  assert.match(provider, /actions\.includes\("apply_files"\)/);
  assert.match(provider, /spec\.repair_state===true/);
  assert.doesNotMatch(provider, /new Set\(\[[^\]]*"ai\.code\.edit"[^\]]*\]\)\.has\(capability\)&&substantive/);
});

test("fast and strong owned model identities remain explicit and local", () => {
  assert.match(provider, /AVANTIQO_CODE_INTERACTIVE_MODEL\|\|"qwen3:1\.7b"/);
  assert.match(provider, /AVANTIQO_CODE_STRONG_MODEL\|\|"qwen3:4b-instruct"/);
  assert.match(provider, /infrastructure_provider:INFRASTRUCTURE/);
  assert.doesNotMatch(provider, /openai|anthropic|gemini/i);
});
