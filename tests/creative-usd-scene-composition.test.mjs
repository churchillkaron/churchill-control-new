import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeUsdSceneCompositionRuntime,
} from "../lib/creative/rendering/runtime/CreativeUsdSceneCompositionRuntime.js";

function input(overrides = {}) {
  return {
    frame_rate: 24,
    start_time_code: 1001,
    end_time_code: 1048,
    sublayers: ["lighting.usda"],
    assets: [{
      prim_name: "Vehicle",
      reference_path: "vehicle.usdc",
      source_asset_checksum: "sha256:vehicle",
      interchange_hash: "interchange:vehicle",
      transform: {
        translate: [0, 0, 0],
        rotate_xyz_degrees: [0, 0, 15],
        scale: [1, 1, 1],
      },
      variant_sets: [{
        name: "paint",
        options: ["Arancio", "Nero"],
        selected: "Arancio",
      }],
    }],
    ...overrides,
  };
}

test("OpenUSD composition authors physical shot metadata and references", () => {
  const result = CreativeUsdSceneCompositionRuntime.author(input());
  assert.equal(result.status, "READY");
  assert.match(result.usda, /#usda 1\.0/);
  assert.match(result.usda, /metersPerUnit = 1/);
  assert.match(result.usda, /upAxis = "Z"/);
  assert.match(result.usda, /startTimeCode = 1001/);
  assert.match(result.usda, /@vehicle\.usdc@/);
  assert.match(result.usda, /@lighting\.usda@/);
});
test("OpenUSD composition authors non-destructive VariantSets", () => {
  const result = CreativeUsdSceneCompositionRuntime.author(input());
  assert.match(result.usda, /variantSets/);
  assert.match(result.usda, /variantSet "paint"/);
  assert.match(result.usda, /string paint = "Arancio"/);
  assert.equal(result.assets[0].variant_sets[0].selected, "Arancio");
});

test("OpenUSD composition rejects duplicate prim names", () => {
  assert.throws(() => CreativeUsdSceneCompositionRuntime.author(input({
    assets: [
      { prim_name: "Vehicle", reference_path: "a.usdc" },
      { prim_name: "Vehicle", reference_path: "b.usdc" },
    ],
  })), /USD_PRIM_NAMES_MUST_BE_UNIQUE/);
});

test("OpenUSD composition rejects invalid selected variant", () => {
  assert.throws(() => CreativeUsdSceneCompositionRuntime.author(input({
    assets: [{
      prim_name: "Vehicle",
      reference_path: "vehicle.usdc",
      variant_sets: [{
        name: "paint",
        options: ["Arancio", "Nero"],
        selected: "Verde",
      }],
    }],
  })), /USD_VARIANT_SELECTION_INVALID/);
});

test("OpenUSD composition is deterministic for identical input", () => {
  const a = CreativeUsdSceneCompositionRuntime.author(input());
  const b = CreativeUsdSceneCompositionRuntime.author(input());
  assert.equal(a.checksum, b.checksum);
  assert.equal(a.composition_hash, b.composition_hash);
});
