import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const finalization = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js", "utf8");
const continuation = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");

test("professional mastering requires premaster QC and preserves translation as a separate stage", () => {
  assert.match(finalization, /professional_premaster_qc_passed!==true/);
  assert.match(finalization, /CreativeMusicFinishingRuntime\.ensureMasters/);
  assert.match(finalization, /professional_mastering_passed:passed/);
  assert.match(finalization, /professional_perceptual_translation_passed:false/);
});

test("professional translation must pass before dailies", () => {
  assert.match(finalization, /professional_mastering_passed!==true/);
  assert.match(finalization, /professional_perceptual_translation_passed:passed/);
  assert.match(finalization, /professional_perceptual_translation_passed!==true/);
  assert.match(finalization, /runMusicDailiesListening/);
});

test("professional tribunal requires passed dailies and never authorizes publication", () => {
  assert.match(finalization, /professional_dailies_passed!==true/);
  assert.match(finalization, /runMusicFinalTribunal/);
  assert.match(finalization, /professional_tribunal_passed:passed/);
  assert.match(finalization, /publication_authorized:false/);
});

test("continuation exposes each finalization stage separately", () => {
  for (const stage of ["MASTERING","PERCEPTUAL_TRANSLATION","DAILIES_LISTENING","FINAL_TRIBUNAL"]) {
    assert.match(continuation, new RegExp(`next\\.stage_id===\\"${stage}\\"`));
  }
  assert.match(continuation, /status:execution\.passed\?"COMPLETE":"REPAIR_REQUIRED"/);
});

test("world-class and Business Partner entrypoints support persisted professional continuation", () => {
  const runtime = readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", "utf8");
  const capability = readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");
  assert.match(runtime, /continueMusicProfessionalProduction/);
  assert.match(runtime, /input\.professional_continue === true \|\| text\(input\.authorized_stage\)/);
  assert.match(capability, /CREATIVE_MUSIC_PROFESSIONAL_CONTINUATION_REFERENCE_REQUIRED/);
  assert.match(capability, /source_asset_id/);
  assert.match(capability, /authorized_stage/);
});
