import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const continuation = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", import.meta.url), "utf8");
const vocal = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicProfessionalVocalProductionRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/creative/music/professional-release/route.js", import.meta.url), "utf8");

test("professional continuation certifies reviewed corrected vocal before mix", () => {
  assert.match(continuation, /certifyProfessionalVocalProduction/);
  assert.match(continuation, /if\(text\(input\.corrected_vocal_asset_id\)\)/);
  assert.match(continuation, /status:"ADVANCED"/);
  assert.match(continuation, /vocal_certification:execution/);
});

test("vocal certification remains human-listening gated and lineage locked", () => {
  assert.match(vocal, /human_listening_review_approved!==true/);
  assert.match(vocal, /professional_vocal_preparation\?\.restored_vocal_asset_id/);
  assert.match(vocal, /corrected\.metadata\?\.source_asset_id/);
  assert.match(vocal, /CREATIVE_MUSIC_PRO_VOCAL_CERT_LINEAGE_MISMATCH/);
});

test("professional release API delegates vocal approval to the core continuation runtime", () => {
  assert.doesNotMatch(route, /import \{ certifyProfessionalVocalProduction \}/);
  assert.match(route, /authorized_stage: "VOCAL_PRODUCTION"/);
  assert.match(route, /continueMusicProfessionalProduction\(\{/);
  assert.match(route, /approved_by: access\?\.userEmail \|\| access\?\.userId/);
});
