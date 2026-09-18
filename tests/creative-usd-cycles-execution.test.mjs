import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const cycles = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
  "utf8",
);

test("Cycles resolves governed bound model assets into composed USD references", () => {
  assert.match(cycles, /CreativeUsdSceneCompositionRuntime\.author/);
  assert.match(cycles, /USD_SCENE_COMPOSITION_OBJECT_NOT_BOUND/);
  assert.match(cycles, /reference_path:bound\.sandbox_path/);
  assert.match(cycles, /source_asset_checksum:bound\.model_checksum/);
  assert.match(cycles, /interchange_hash:bound\.automotive_interchange/);
});

test("composed USD objects are removed from loose-object import", () => {
  assert.match(cycles, /const composedIds=new Set/);
  assert.match(cycles, /renderObjects=modelBinding\.objects\.filter/);
  assert.match(cycles, /!composedIds\.has/);
});

test("Blender imports the composed USDA layer before loose objects", () => {
  const usdIndex = cycles.indexOf("bpy.ops.wm.usd_import(filepath=usd_path)");
  const looseIndex = cycles.indexOf("for o in cfg['objects']: add_obj(o)");
  assert.ok(usdIndex >= 0);
  assert.ok(looseIndex > usdIndex);
});

test("render evidence exposes USD composition identity", () => {
  assert.match(cycles, /usd_scene_composition_contract/);
  assert.match(cycles, /usd_scene_composition_hash/);
  assert.match(cycles, /usd_scene_composition_checksum/);
});
