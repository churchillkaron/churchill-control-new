import fs from "node:fs";
import assert from "node:assert/strict";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
const readiness=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoReadinessRuntime.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");

assert.match(provider,/AvantiqoVideoLocalQueueProvider/);
assert.match(registration,/AVANTIQO_LOCAL_NODE_V1/);
assert.match(readiness,/AVANTIQO_VIDEO_LOCAL_READINESS_V2/);
assert.match(local,/local-video-ltx25:/);
assert.doesNotMatch(provider,/MODAL_VIDEO_FUNCTION_NAME/);
assert.doesNotMatch(registration,/MODAL_FUNCTION_NAME/);
console.log("AVANTIQO_VIDEO_LOCAL_TRANSPORT_ALIGNMENT=PASS");
