import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preparer=fs.readFileSync("scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs","utf8");
const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");

test("local fixture preparer is provider-free and creates bounded certification evidence",()=>{
  assert.match(preparer,/provider_calls_added:\s*0/);
  assert.match(preparer,/AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1/);
  assert.match(preparer,/source_scope/);
});

test("core certification fails closed until current engine-specific certification exists",()=>{
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(core,/generation_performed: false/);
  assert.match(core,/image_engine_certification_required: true/);
  assert.match(core,/cinema_engine_certification_required: true/);
  assert.match(core,/fail_closed: true/);
});
