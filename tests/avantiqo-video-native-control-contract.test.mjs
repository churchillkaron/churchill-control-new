import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const control = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoNativeControlRuntime.js",
  "utf8",
);
const dispatch = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  "utf8",
);
const provider = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  "utf8",
);
const job = fs.readFileSync(
  "services/avantiqo-video-engine/modal_native_job.py",
  "utf8",
);
const master = fs.readFileSync(
  "services/avantiqo-video-engine/modal_native_controlled_master.py",
  "utf8",
);

test("Shot Bible is compiled into executable native Video controls", () => {
  assert.match(control, /CREATIVE_VIDEO_NATIVE_CONTROL_V1/);
  assert.match(control, /OPENING_FRAME/);
  assert.match(control, /CLOSING_FRAME/);
  assert.match(control, /reference_conditions/);
  assert.match(control, /native_audio_required/);
  assert.match(control, /shot_bible_is_execution_source:\s*true/);
});

test("Video dispatch applies native controls before Service Runtime routing", () => {
  const apply = dispatch.indexOf("CreativeVideoNativeControlRuntime.apply");
  const update = dispatch.indexOf("ProductionTaskRuntime.update");
  assert.ok(apply >= 0, "native control compiler missing");
  assert.ok(update > apply, "controlled input must be persisted before dispatch");
  assert.match(dispatch, /creative_video_native_control_contract/);
});

test("owned Video provider masters first-last-frame generation on direct Modal", () => {
  assert.match(provider, /"ai\.video\.first_last_frame_to_video"/);
  assert.match(provider, /ROUTED_MASTERED_CAPABILITIES\.has\(capability\)/);
  assert.match(provider, /transportMode:\s*"direct-sdk"/);
  assert.match(provider, /functionName:\s*MODAL_VIDEO_FUNCTION_NAME/);
});

test("CPU job adapter stages governed ordered reference conditions and uses one GPU generation", () => {
  assert.match(job, /NATIVE_CONTROL_CONTRACT = "CREATIVE_VIDEO_NATIVE_CONTROL_V1"/);
  assert.match(job, /_controlled_conditions/);
  assert.match(job, /generate_native_controlled_master\.remote/);
  assert.match(job, /"gpu_generation_calls": 1/);
  assert.match(job, /"native_control_executed"/);
  assert.doesNotMatch(job, /generate_native_controlled_master\.remote[\s\S]*generate_native_controlled_master\.remote/);
});

test("controlled LTX master uses exact frame-index image conditioning without upscaling", () => {
  assert.match(master, /TI2VID_ONE_STAGE_FULL_DEV_BF16_MULTI_CONDITION/);
  assert.match(master, /command\.extend\(\[\s*"--image"/);
  assert.match(master, /frame_index/);
  assert.match(master, /multi_keyframe_conditioning_used/);
  assert.match(master, /first_frame_conditioning_used/);
  assert.match(master, /last_frame_conditioning_used/);
  assert.match(master, /"pixel_upscale_used": False/);
  assert.match(master, /"learned_latent_upsampler_used": False/);
  assert.match(master, /"learned_spatial_upscaler_used": False/);
  assert.match(master, /"temporal_interpolation_used": False/);
  assert.match(master, /"master_is_exact_model_output": True/);
  assert.match(master, /retries=0/);
});
