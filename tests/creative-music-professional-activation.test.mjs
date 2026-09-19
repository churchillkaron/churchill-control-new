import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const execution = readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", "utf8");
const route = readFileSync("app/api/creative/music/professional-release/route.js", "utf8");

test("professional generation marks its source explicitly for release continuation", () => {
  assert.match(execution, /professional_release_requested: true/);
  assert.match(execution, /professional_release_standard: "PROFESSIONAL_RELEASE"/);
  assert.match(execution, /CreativeAssetsRuntime\.update\(sourceAsset\.id/);
});

test("professional release discovery ignores ordinary fast-generation sources", () => {
  assert.match(route, /asset\.metadata\?\.professional_release_requested === true/);
  assert.match(route, /assets\.filter\(\(asset\) => asset\.metadata\?\.professional_release_requested === true\)/);
});
