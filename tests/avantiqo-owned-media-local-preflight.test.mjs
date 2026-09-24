import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("retired owned-media preflight wrapper stays retired",()=>{
  assert.equal(fs.existsSync("scripts/preflight-avantiqo-owned-media-local.mjs"),false);
});

test("current core certification validates local runtime files and fails closed",()=>{
  const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");
  assert.match(core,/AvantiqoImageProvider\.js/);
  assert.match(core,/AvantiqoVideoProviderV2\.js/);
  assert.match(core,/avantiqo-node01-worker\.ps1/);
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(core,/process\.exitCode = 2/);
});
