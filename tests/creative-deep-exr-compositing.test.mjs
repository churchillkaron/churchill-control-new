import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sandbox = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeSandboxRuntime.js",
  "utf8",
);
const snapshots = fs.readFileSync(
  "lib/creative/tools/runtime/CreativeToolSnapshotRuntime.js",
  "utf8",
);
const deep = fs.readFileSync(
  "lib/creative/compositing/runtime/CreativeDeepExrCompositingRuntime.js",
  "utf8",
);

test("OpenImageIO is a governed reusable creative tool", () => {
  assert.match(sandbox, /openimageio:\s*\[/);
  assert.match(sandbox, /openimageio-tools/);
  assert.match(sandbox, /"oiiotool"/);
  assert.match(snapshots, /openimageio:1/);
});

test("Deep EXR requires multiple depth layers rather than relabeling a flat EXR", () => {
  assert.match(deep, /DEEP_EXR_MULTIPLE_DEPTH_LAYERS_REQUIRED/);
  assert.match(deep, /"--ch", "R,G,B,A,Z"/);
  assert.match(deep, /"--deepen"/);
  assert.match(deep, /deep_operation_chain_verified:\s*true/);
});

test("Deep EXR production uses deep merge and preserves deep master", () => {
  assert.match(deep, /"--deepmerge"/);
  assert.match(deep, /production_master_remains_deep:\s*true/);
  assert.match(deep, /variable_depth_samples_per_pixel_supported:\s*true/);
});

test("Deep holdout uses depth samples and flattening is preview-only", () => {
  assert.match(deep, /"--deepholdout"/);
  assert.match(deep, /"--flatten"/);
  assert.match(deep, /flattening_used_for_preview_only:\s*true/);
});

test("Deep EXR does not use provider calls", () => {
  assert.match(deep, /provider_calls_performed:\s*false/);
  assert.match(deep, /tool:\s*"OpenImageIO"/);
});
