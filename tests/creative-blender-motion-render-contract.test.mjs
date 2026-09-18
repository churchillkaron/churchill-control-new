import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const blender = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeBlenderRuntime.js",
  "utf8",
);
const packaging = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeBlenderSequencePackagingRuntime.js",
  "utf8",
);
const snapshots = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeToolSnapshotRuntime.js",
  "utf8",
);
const sandbox = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeSandboxRuntime.js",
  "utf8",
);
const motion = fs.readFileSync(
  "lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignRenderRuntime.js",
  "utf8",
);

test("animated Blender renders use reusable governed tool snapshots", () => {
  assert.match(blender, /CreativeToolSnapshotRuntime\.ensure/);
  assert.match(blender, /tool_id: TOOL_ID/);
  assert.match(snapshots, /SNAPSHOT_REVISIONS=Object\.freeze\(\{blender:3/);
  assert.match(snapshots, /bootstrapTool/);
  assert.match(snapshots, /creative_tool_snapshots/);
});
test("animation is rendered as lossless RGBA frames before movie packaging", () => {
  assert.match(blender, /frames_dir = os\.path\.join/);
  assert.match(blender, /scene\.render\.image_settings\.file_format = 'PNG'/);
  assert.match(blender, /bpy\.ops\.render\.render\(animation=True\)/);
  assert.match(blender, /CreativeBlenderSequencePackagingRuntime\.package/);
  assert.equal(blender.includes("scene.render.ffmpeg.codec = 'QTRLE'"), false);
});

test("sequence packaging produces alpha-preserving ProRes 4444", () => {
  assert.match(packaging, /prores_ks/);
  assert.match(packaging, /"-profile:v","4"/);
  assert.match(packaging, /"yuva444p10le"/);
  assert.match(packaging, /has_alpha:true/);
});

test("Blender sandbox image contains render and packaging dependencies", () => {
  assert.match(sandbox, /"blender", "ffmpeg", "libegl1", "libgl1", "libgles2"/);
  assert.match(sandbox, /cmd: "blender"/);
  assert.match(sandbox, /args: \["--version"\]/);
});

test("cinematic motion output is a real Blender world-space render", () => {
  assert.match(motion, /CreativeBlenderRuntime\.render/);
  assert.match(motion, /mime_type:rendered\.mime_type/);
  assert.match(motion, /buffer:rendered\.buffer/);
  assert.match(motion, /world_space_rendered:true/);
  assert.match(motion, /provider_calls_performed:false/);
});
