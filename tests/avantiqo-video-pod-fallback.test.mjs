import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const retired=[
 "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js",
 "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js",
 "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodLease.js",
 "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js",
 "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV4.js",
 "app/api/internal/video/runpod-pods/process/route.js",
];

test("legacy Video Pod fallback stack stays retired",()=>{
  for(const file of retired) assert.equal(fs.existsSync(file),false,file);
});

test("current Video provider uses the Node01 local queue",()=>{
  const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
  const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");
  assert.match(provider,/AvantiqoVideoLocalQueueProvider\.execute/);
  assert.match(local,/AVANTIQO_LOCAL_NODE_V1/);
  assert.doesNotMatch(provider,/RunPod|runpod|Modal|modal/);
});
