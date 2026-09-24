import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile(
  "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js",
  "utf8",
);
const worker = await readFile(
  "scripts/local-node/avantiqo-node01-worker.ps1",
  "utf8",
);

test("owned Code provider exposes exact-job bounded cancellation", () => {
  assert.match(provider, /async function cancel\(input=\{\}\)/);
  assert.match(provider, /rawJobId\(jobId\)/);
  assert.match(provider, /\.in\("status",\["QUEUED","RUNNING"\]\)/);
  assert.match(provider, /status:"CANCELLED"/);
  assert.match(provider, /error_code:"CANCELLED_BY_CALLER"/);
  assert.match(provider, /exact_job_only:true/);
  assert.match(provider, /AvantiqoCodeLocalQueueProvider=\{id:"avantiqo-code",available,cancel/);
});

test("Node01 source protects one supervisor and retains a dedicated Code lane", () => {
  assert.match(worker, /Global\\AvantiqoNode01WorkerSupervisor/);
  assert.match(worker, /AVANTIQO_NODE01_SUPERVISOR_ALREADY_RUNNING/);
  assert.match(worker, /foreach \(\$childLane in @\('gpu','code','cpu','live','training'\)\)/);
  assert.match(worker, /\$CodeCapabilities/);
  assert.match(worker, /p_limit=1/);
  assert.match(worker, /ReleaseMutex\(\)/);
});
test("interactive Code uses 1.7B while mutation-capable planning escalates to the strong 4B model", () => {
  assert.match(provider, /AVANTIQO_CODE_STRONG_MODEL\|\|"qwen3:4b-instruct"/);
  assert.match(provider, /AVANTIQO_CODE_INTERACTIVE_MODEL\|\|"qwen3:1\.7b"/);
  assert.doesNotMatch(provider, /AVANTIQO_CODE_FAST_MODEL/);
  assert.match(provider, /function strongCodeModelRequired/);
  assert.match(provider, /actions\.includes\("apply_files"\)/);
  assert.match(provider, /spec\.discovery_locked===true/);
  assert.match(provider, /spec\.source_quality_repair_required===true/);
  assert.match(provider, /const runtimeModel=strongModelRequired\?STRONG_MODEL:MODEL/);
  assert.match(provider, /strong_model_required:strongModelRequired/);
  assert.match(provider, /model:runtimeModel/);
  assert.match(provider, /runtime_model:runtimeModel/);
  assert.match(provider, /runtime_model:text\(r\.runtime_model\|\|row\.model\)\|\|MODEL/);
});
