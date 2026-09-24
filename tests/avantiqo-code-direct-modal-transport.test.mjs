import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js", "utf8");

test("Code uses only the owned local queue provider", () => {
  assert.match(provider, /AvantiqoCodeLocalQueueProvider/);
  assert.match(provider, /isCodeLocalCapability/);
  assert.match(provider, /AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE/);
  assert.match(provider, /return AvantiqoCodeLocalQueueProvider\.execute\(input\)/);
  assert.match(provider, /return AvantiqoCodeLocalQueueProvider\.getStatus\(input\)/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});
