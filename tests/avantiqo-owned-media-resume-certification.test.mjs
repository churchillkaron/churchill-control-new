import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");

test("retired monolithic resume campaign is not silently reused",()=>{
  assert.match(core,/retired_monolithic_benchmark_reused: false/);
  assert.match(core,/generation_performed: false/);
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
});

test("current certification boundary remains explicitly fail closed",()=>{
  assert.match(core,/image_engine_certification_required: true/);
  assert.match(core,/cinema_engine_certification_required: true/);
  assert.match(core,/production_certified: false/);
  assert.match(core,/fail_closed: true/);
  assert.match(core,/process\.exitCode = 2/);
});
