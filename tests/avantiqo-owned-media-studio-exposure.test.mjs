import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const IMAGE_CAPABILITIES = [
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
];

const CINEMA_CAPABILITIES = [
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
];

test("Studio tool registry exposes the complete owned Image and Cinema surfaces", () => {
  const registry = source("lib/creative/tools/registry/CreativeToolRegistry.js");
  for (const capability of [...IMAGE_CAPABILITIES, ...CINEMA_CAPABILITIES]) {
    assert.match(registry, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(registry, /IMAGE_UPSCALE:\s*"ai\.image\.upscale"/);
  assert.match(registry, /VIDEO_EXTEND:\s*"ai\.video\.extend"/);
  assert.match(registry, /VIDEO_UPSCALE:\s*"ai\.video\.upscale"/);
  assert.match(registry, /CREATIVE_TOOL_CAPABILITIES\.IMAGE_UPSCALE/);
  assert.match(registry, /CREATIVE_TOOL_CAPABILITIES\.VIDEO_EXTEND/);
  assert.match(registry, /CREATIVE_TOOL_CAPABILITIES\.VIDEO_UPSCALE/);
});

test("Studio task resolution can address image upscale, video extend and video upscale explicitly", () => {
  const resolver = source("lib/creative/services/CreativeServiceResolver.js");
  assert.match(resolver, /UPSCALE_IMAGE:\s*"ai\.image\.upscale"/);
  assert.match(resolver, /EXTEND_VIDEO:\s*"ai\.video\.extend"/);
  assert.match(resolver, /UPSCALE_VIDEO:\s*"ai\.video\.upscale"/);
  assert.match(resolver, /UPSCALE:\s*"ai\.image\.upscale"/);
});

test("capability execution resolver covers every implemented Image and Cinema capability", () => {
  const resolver = source(
    "lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver.js",
  );
  for (const capability of [...IMAGE_CAPABILITIES, ...CINEMA_CAPABILITIES]) {
    assert.match(resolver, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(resolver, /EDIT_IMAGE:\s*\["ai\.image\.edit"\]/);
  assert.match(resolver, /INPAINT_IMAGE:\s*\["ai\.image\.inpaint"\]/);
  assert.match(resolver, /OUTPAINT_IMAGE:\s*\["ai\.image\.outpaint"\]/);
  assert.match(resolver, /IMAGE_TO_VIDEO:\s*\["ai\.video\.image_to_video"\]/);
  assert.match(resolver, /FIRST_LAST_FRAME_TO_VIDEO:\s*\["ai\.video\.first_last_frame_to_video"\]/);
  assert.match(resolver, /VIDEO_TO_VIDEO:\s*\["ai\.video\.video_to_video"\]/);
  assert.match(resolver, /EDIT_VIDEO:\s*\["ai\.video\.edit"\]/);
  assert.match(resolver, /INPAINT_VIDEO:\s*\["ai\.video\.inpaint"\]/);
  assert.match(resolver, /EXTEND_VIDEO:\s*\["ai\.video\.extend"\]/);
});

test("first-last Cinema service uses a compatibility alias without changing execution capability", () => {
  const resolver = source(
    "lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver.js",
  );
  assert.match(resolver, /"ai\.video\.first_last_frame_to_video"/);
  assert.match(resolver, /catalog_service_id:\s*"ai\.video\.keyframe_to_video"/);
  assert.match(resolver, /execution_capabilities:\s*Object\.freeze\(\[\s*"ai\.video\.first_last_frame_to_video"/s);
  assert.match(resolver, /platform_ai_service_alias/);
});
