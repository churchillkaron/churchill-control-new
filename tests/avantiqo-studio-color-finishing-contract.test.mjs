import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/color/runtime/CreativeColorFinishingRuntime.js");
const bootstrap = read("lib/creative/color/runtime/CreativeColorFinishingBootstrap.js");
const instrumentation = read("instrumentation.js");
const finishing = read("lib/creative/post-production/runtime/CreativeProfessionalFinishingBootstrap.js");
const soundtrack = read("lib/creative/audio/runtime/CreativeMasterSoundtrackRenderGate.js");

for (const contract of [
  "AVANTIQO_COLOR_FINISHING_V1",
  "AVANTIQO_COLOR_FINISHING_QC_V1",
  "AVANTIQO_COLOR_FINISHING_QC_SEAL_V1",
  "AVANTIQO_SDR_REC709_MASTER_V1",
]) {
  assert.match(runtime, new RegExp(contract));
}

for (const target of [
  "REC709_SDR",
  "REC2020_PQ",
  "REC2020_HLG",
]) {
  assert.match(runtime, new RegExp(target));
}

assert.match(runtime, /FFMPEG_COLORSPACE_BT709/);
assert.match(runtime, /ACES_OR_OCIO_REQUIRED/);
assert.match(runtime, /COLOR_HDR_REQUIRES_VERIFIED_ACES_OR_OCIO_OUTPUT_TRANSFORM/);
assert.match(runtime, /aces_or_ocio_not_claimed_without_runtime:\s*true/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /promptless:\s*true/);

for (const metadataField of [
  "color_space",
  "color_transfer",
  "color_primaries",
  "color_range",
  "pixel_format",
]) {
  assert.match(runtime, new RegExp(metadataField));
}

for (const filter of [
  "colorspace",
  "eq=brightness",
  "lut3d",
]) {
  assert.match(runtime, new RegExp(filter));
}

assert.match(runtime, /COLOR_INPUT_METADATA_REQUIRED/);
assert.match(runtime, /COLOR_LOOK_LUT_NOT_APPROVED/);
assert.match(runtime, /COLOR_TIMELINE_COVERAGE_GAP/);
assert.match(runtime, /COLOR_TIMELINE_DURATION_MISMATCH/);
assert.match(runtime, /color_finishing_keyword_look_inference_used:\s*false/);
assert.match(runtime, /color_finishing_structured_grade_only:\s*true/);
assert.match(runtime, /color_finishing_actual_pixels_created:\s*true/);
assert.match(runtime, /color_finishing_output_transform_applied:\s*true/);
assert.match(runtime, /color_finishing_requires_final_perceptual_review:\s*true/);
assert.match(runtime, /color_finishing_aces_or_ocio_claimed:\s*false/);
assert.match(runtime, /actual_rendered_pixels_are_authority:\s*true/);
assert.match(runtime, /ffprobe_output_metadata_is_authority:\s*true/);
assert.match(runtime, /aggregate_beauty_cannot_override_color_metadata_failure:\s*true/);
assert.match(runtime, /audio_stream_copy_requires_integrity_revalidation:\s*true/);
assert.match(runtime, /CreativeMasterSoundtrackIntegrityRuntime\.validate/);
assert.match(runtime, /master_soundtrack_integrity_passed_after_color_finishing/);
assert.match(runtime, /color_finishing_qc_sealed:\s*qc\.passed/);
assert.match(runtime, /color_finishing_locked:\s*qc\.passed/);

assert.match(bootstrap, /AVANTIQO_COLOR_FINISHING_BOOTSTRAP_V1/);
assert.match(bootstrap, /CreativeColorFinishingRuntime\.finish/);
assert.match(bootstrap, /runs_after_professional_finishing:\s*true/);
assert.match(bootstrap, /revalidates_master_audio_after_color_render:\s*true/);
assert.match(bootstrap, /hdr_requires_verified_aces_or_ocio_output_transform:\s*true/);
assert.match(bootstrap, /fail_closed:\s*true/);

assert.match(finishing, /CreativeProfessionalFinalAudioIntegrityRuntime\.validate/);
assert.match(soundtrack, /CreativeMasterSoundtrackIntegrityRuntime\.validate/);

const editorialIndex = instrumentation.indexOf("CreativeEditorialAssemblyRenderBootstrap");
const motionIndex = instrumentation.indexOf("CreativeMotionGraphicsRenderBootstrap");
const soundtrackIndex = instrumentation.indexOf("CreativeMasterSoundtrackRenderGate");
const finishingIndex = instrumentation.indexOf("CreativeProfessionalFinishingBootstrap");
const colorIndex = instrumentation.indexOf("CreativeColorFinishingBootstrap");
assert.ok(editorialIndex >= 0);
assert.ok(motionIndex > editorialIndex);
assert.ok(soundtrackIndex > motionIndex);
assert.ok(finishingIndex > soundtrackIndex);
assert.ok(colorIndex > finishingIndex);

console.log("AVANTIQO_STUDIO_COLOR_FINISHING_CONTRACT=PASS");
