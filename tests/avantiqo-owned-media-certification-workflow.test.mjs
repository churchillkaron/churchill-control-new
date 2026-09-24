import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");
const fixtures=fs.readFileSync("scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs","utf8");

test("current owned-media core certification is local and cannot auto-activate production",()=>{
  assert.match(core,/AVANTIQO_OWNED_MEDIA_CORE_LOCAL_CERTIFICATION_V2/);
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(core,/generation_performed: false/);
  assert.match(core,/quality_review_required: true/);
  assert.match(core,/economics_measurement_required: true/);
  assert.match(core,/production_certified: false/);
  assert.match(core,/production_activation_performed: false/);
  assert.match(core,/production_deploy_performed: false/);
});

test("certification fixtures remain locally prepared and provenance bound",()=>{
  assert.match(fixtures,/AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1/);
  assert.match(fixtures,/provider_calls_added:\s*0/);
  assert.match(fixtures,/source_scope/);
});
