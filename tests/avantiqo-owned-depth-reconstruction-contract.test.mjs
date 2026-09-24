import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const modal=fs.readFileSync("services/avantiqo-image-engine/modal_app.py","utf8");
const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js","utf8");
const registry=fs.readFileSync("lib/creative/tools/registry/CreativeToolRegistry.js","utf8");

test("retained owned image research runtime contains real 16-bit depth estimation",()=>{
  assert.match(modal,/DEPTH_MODEL = "depth-anything\/Depth-Anything-V2-Small-hf"/);
  assert.match(modal,/def estimate_depth\(data: dict\[str, Any\]\)/);
  assert.match(modal,/AutoModelForDepthEstimation/);
  assert.match(modal,/creative\.depth\.estimate/);
  assert.match(modal,/mode="I;16"/);
});

test("active image provider fails depth closed until a local depth worker is implemented",()=>{
  assert.match(provider,/AVANTIQO_IMAGE_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(provider,/estimate_depth|ownedImageDepthWorker|Modal|modal/);
  assert.match(registration,/"creative\.depth\.estimate"/);
  assert.match(registration,/owned_depth_estimation: false/);
  assert.match(registration,/modal_fallback_for_local_capabilities: false/);
});

test("creative registry may describe depth capability without falsely certifying active execution",()=>{
  assert.match(registry,/DEPTH_ESTIMATE: "creative\.depth\.estimate"/);
  assert.match(registry,/CREATIVE_TOOL_CAPABILITIES\.DEPTH_ESTIMATE/);
  assert.match(registration,/target_capabilities: TARGET_CAPABILITIES/);
});
