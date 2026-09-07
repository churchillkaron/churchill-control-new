import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/motion-graphics/runtime/CreativeMotionGraphicsRuntime.js");
const renderer = read("lib/creative/motion-graphics/runtime/CreativeMotionGraphicsRenderRuntime.js");
const qc = read("lib/creative/motion-graphics/runtime/CreativeMotionGraphicsQualityRuntime.js");
const bootstrap = read("lib/creative/motion-graphics/runtime/CreativeMotionGraphicsRenderBootstrap.js");
const fontResolver = read("lib/creative/design/runtime/CreativeDesignFontResolverRuntime.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_MOTION_GRAPHICS_V1/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /provider_prompt_persisted:\s*false/);
assert.match(runtime, /deterministic_text_required:\s*true/);
assert.match(runtime, /deterministic_logo_required:\s*true/);
assert.match(runtime, /generated_text_pixels_forbidden:\s*true/);
assert.match(runtime, /generated_logo_redraw_forbidden:\s*true/);
assert.match(runtime, /motion_graphics_do_not_retime_editorial_picture:\s*true/);
assert.match(runtime, /motion_graphics_do_not_modify_master_audio:\s*true/);

for (const type of [
  "TITLE",
  "LOWER_THIRD",
  "CALLOUT",
  "CAPTION",
  "LOGO_BUG",
  "LOGO_STING",
  "END_CARD",
  "DATA_LABEL",
  "KINETIC_TEXT",
]) {
  assert.match(runtime, new RegExp(type));
}

for (const animation of [
  "NONE",
  "FADE",
  "SLIDE_UP",
  "SLIDE_DOWN",
  "SLIDE_LEFT",
  "SLIDE_RIGHT",
]) {
  assert.match(runtime, new RegExp(animation));
}

for (const blocker of [
  "MOTION_GRAPHICS_EXACT_TEXT_REQUIRED",
  "MOTION_GRAPHICS_FONT_BINDING_REQUIRED",
  "MOTION_GRAPHICS_LOGO_ASSET_REQUIRED",
  "MOTION_GRAPHICS_TIMING_OUT_OF_RANGE",
  "MOTION_GRAPHICS_DUPLICATE_ELEMENT_ID",
]) {
  assert.match(runtime, new RegExp(blocker));
}

assert.match(renderer, /AVANTIQO_MOTION_GRAPHICS_RENDER_V1/);
assert.match(renderer, /CreativeDesignFontResolverRuntime\.resolve/);
assert.match(renderer, /MOTION_GRAPHICS_LOGO_ASSET_NOT_APPROVED/);
assert.match(renderer, /drawtext=/);
assert.match(renderer, /overlay=x=/);
assert.match(renderer, /fade=t=in/);
assert.match(renderer, /motion_graphics_bindings/);
assert.match(renderer, /exact_text_rendering:\s*true/);
assert.match(renderer, /generated_text_pixels_used:\s*false/);
assert.match(renderer, /generated_logo_redraw_used:\s*false/);
assert.match(renderer, /editorial_picture_retimed:\s*false/);
assert.match(renderer, /master_audio_modified:\s*false/);
assert.match(renderer, /"-c:a",\s*"copy"/);

assert.match(fontResolver, /brand_locked_never_falls_back:\s*true/);
assert.match(fontResolver, /host_os_font_lookup_forbidden:\s*true/);
assert.match(fontResolver, /platform_font_requires_verified_license:\s*true/);

assert.match(qc, /AVANTIQO_MOTION_GRAPHICS_QC_V1/);
assert.match(qc, /AVANTIQO_MOTION_GRAPHICS_QC_SEAL_V1/);
assert.match(qc, /MOTION_GRAPHICS_BINDING_COVERAGE_REQUIRED/);
assert.match(qc, /MOTION_GRAPHICS_GENERATED_TEXT_FORBIDDEN/);
assert.match(qc, /MOTION_GRAPHICS_GENERATED_LOGO_REDRAW_FORBIDDEN/);
assert.match(qc, /MOTION_GRAPHICS_EDITORIAL_RETIME_FORBIDDEN/);
assert.match(qc, /MOTION_GRAPHICS_MASTER_AUDIO_MUTATION_FORBIDDEN/);
assert.match(qc, /provider_calls_executed:\s*0/);
assert.match(qc, /motion_graphics_qc_sealed:\s*evaluation\.passed/);

assert.match(bootstrap, /AVANTIQO_MOTION_GRAPHICS_RENDER_BOOTSTRAP_V1/);
assert.match(bootstrap, /CreativeMotionGraphicsQualityRuntime\.seal/);
assert.match(bootstrap, /fail_closed_qc:\s*true/);
assert.match(bootstrap, /preserves_editorial_timing:\s*true/);
assert.match(bootstrap, /preserves_master_audio:\s*true/);

const editorial = instrumentation.indexOf("CreativeEditorialAssemblyRenderBootstrap");
const motion = instrumentation.indexOf("CreativeMotionGraphicsRenderBootstrap");
const soundtrack = instrumentation.indexOf("CreativeMasterSoundtrackRenderGate");
const finishing = instrumentation.indexOf("CreativeProfessionalFinishingBootstrap");
assert.ok(editorial >= 0);
assert.ok(motion > editorial);
assert.ok(soundtrack > motion);
assert.ok(finishing > soundtrack);

console.log("AVANTIQO_STUDIO_MOTION_GRAPHICS_CONTRACT=PASS");
