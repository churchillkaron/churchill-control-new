import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("Tribunal gives physical-realism and sound-sync reviewers dedicated evidence scopes", () => {
  assert.match(source, /return "PHYSICAL_REALISM"/);
  assert.match(source, /return "SOUND_VISUAL_SYNC"/);
  assert.match(source, /return "VISUAL_CONTINUITY"/);
  assert.match(source, /return "RIGHTS_SAFETY"/);
  assert.match(source, /case "PHYSICAL_REALISM"/);
  assert.match(source, /case "SOUND_VISUAL_SYNC"/);
  assert.match(source, /case "VISUAL_CONTINUITY"/);
  assert.match(source, /case "RIGHTS_SAFETY"/);
  assert.match(source, /UNSELECTED_CATALOG_ASSET_INVENTED/);
  assert.match(source, /Organization catalog availability is not planned use/i);
  assert.match(source, /An asset explicitly excluded by the canonical plan/i);
  assert.match(source, /single uninterrupted shot per beat.*entire 60-second film.*one continuous take/i);
  assert.match(source, /WHOLE_FILM_SINGLE_TAKE_INVENTED/);
  assert.match(source, /reviewer_scoped_evidence:\s*reviewerPlanEvidence\(reviewer, plan\)/);
  assert.match(source, /Organization catalog audio, available assets, prior scores, narration files, or generated music are not planned soundtrack usage/i);
  assert.match(source, /Do not inspect or infer soundtrack usage from broader project asset context/i);
  assert.match(source, /If the plan explicitly excludes pre-composed music and instead specifies silence plus environmental\/human-caused sound emergence/i);
  assert.match(source, /Before claiming required evidence is missing/i);
});
