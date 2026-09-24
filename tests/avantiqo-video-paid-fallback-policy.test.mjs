import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");

test("paid Video fallback is retired from active production routing",()=>{
  assert.equal(fs.existsSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js"),false);
  assert.match(registration,/local_only_execution: true/);
  assert.match(registration,/modal_fallback_allowed: false/);
  assert.match(registration,/external_provider_fallback_allowed: false/);
  assert.doesNotMatch(provider,/RunPod|runpod|Modal|modal/);
});
