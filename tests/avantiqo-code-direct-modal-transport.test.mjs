import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js", "utf8");
const localQueue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");

test("Code uses the owned local-node queue as its only execution transport", () => {
  assert.match(provider, /AvantiqoCodeLocalQueueProvider/);
  assert.match(provider, /AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE/);
  assert.match(provider, /return AvantiqoCodeLocalQueueProvider\.execute\(input\)/);
  assert.match(localQueue, /INFRASTRUCTURE="AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(localQueue, /lane:"code"/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});

test("Code status and cancellation remain bound to exact local Code job ids", () => {
  assert.match(provider, /if \(!isCodeLocalJob\(jobId\)\) throw new Error\("AVANTIQO_CODE_LOCAL_JOB_ID_REQUIRED"\)/);
  assert.match(provider, /return AvantiqoCodeLocalQueueProvider\.getStatus\(input\)/);
  assert.match(provider, /return AvantiqoCodeLocalQueueProvider\.cancel\(input\)/);
});
