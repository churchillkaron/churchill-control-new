import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const router = fs.readFileSync("lib/creative/video/runtime/CreativeVideoEngineRouter.js", "utf8");
const dispatch = fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js", "utf8");
const resolver = fs.readFileSync("lib/platform/service-runtime/providers/ProviderResolver.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js", "utf8");

test("Studio Cinema is Avantiqo-owned only and external video fallback is impossible", () => {
  assert.match(router, /CREATIVE_VIDEO_EXECUTION_ROUTE_V5/);
  assert.match(router, /owned_only_required:\s*true/);
  assert.match(router, /external_fallback_allowed:\s*false/);
  assert.match(router, /external_provider_role:\s*"FORBIDDEN"/);
  assert.match(router, /execution_scope:\s*OWNED_PREPRODUCTION_SCOPE/);
  assert.match(router, /benchmark_only:\s*true/);
  assert.match(router, /production_certified:\s*false/);
  assert.match(router, /studio_preproduction_review:\s*true/);
  assert.match(dispatch, /enforceStudioOwnedVideoPolicy/);
  assert.match(dispatch, /owned_only_required:\s*true/);
  assert.match(dispatch, /external_provider_fallback_forbidden:\s*true/);
  assert.match(resolver, /AVANTIQO_OWNED_PROVIDER_REQUIRED/);
  assert.match(resolver, /AVANTIQO_OWNED_ONLY_VIDEO_CAPABILITIES/);
  assert.match(resolver, /policy\.studio_preproduction_review === true/);
  assert.match(resolver, /allowed\.length === 0/);
  assert.match(resolver, /ai\.video\.generate/);
  assert.match(resolver, /ai\.video\.image_to_video/);
  assert.match(resolver, /ai\.video\.first_last_frame_to_video/);
});

test("Avantiqo Cinema review generation defaults to fast distilled and native master cannot be selected accidentally", () => {
  assert.match(registration, /infrastructure_provider:\s*"MODAL_DIRECT_ASYNC_V1"/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(registration, /runpod_generation_routing:\s*false/);
  assert.match(registration, /NATIVE_MASTER_FOUNDATION_MODEL = "Lightricks\/LTX-2\.5"/);
  assert.match(registration, /configured_foundation_model:\s*NATIVE_MASTER_FOUNDATION_MODEL/);
  assert.match(provider, /createAvantiqoOwnedModalWorker/);
  assert.match(provider, /FAST_PREVIEW_FUNCTION_NAME = "generate_investor_t2v_job"/);
  assert.match(provider, /return fastPreviewVideoWorker\.execute\(advancedInput\(input\)\)/);
  assert.match(provider, /AVANTIQO_VIDEO_NATIVE_MASTER_ROUTE_DISABLED/);
  assert.match(provider, /AVANTIQO_VIDEO_FAST_CONDITIONED_LANE_REQUIRED/);
});
