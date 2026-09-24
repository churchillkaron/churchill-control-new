import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("retired Video Pod termination runtimes are absent",()=>{
  assert.equal(fs.existsSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),false);
  assert.equal(fs.existsSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrPodRuntime.js"),false);
});

test("active Video status accepts only local Node01 job ids",()=>{
  const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
  assert.match(provider,/isVideoLtx25LocalJob/);
  assert.match(provider,/AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED/);
});
