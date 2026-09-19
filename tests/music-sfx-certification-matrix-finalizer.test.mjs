import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=await readFile("scripts/finalize-avantiqo-music-sfx-certification-matrix-local.mjs","utf8");
test("SFX matrix finalizer requires six bound reviewed samples",()=>{assert.match(source,/paths\.length!==6/);assert.match(source,/MATRIX_JOB_BINDING_INVALID/);assert.match(source,/reviewer:text\(review.reviewer\)/);assert.match(source,/human_reviewers/);assert.match(source,/minimum_score_0_to_100\)<92/);assert.match(source,/technical_quality_passed!==true/);});
test("SFX matrix requires every benchmark category and remains preproduction",()=>{assert.match(source,/MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES/);assert.match(source,/MATRIX_CATEGORY_MISSING/);assert.match(source,/matrix_certified:true/);assert.match(source,/production_routing_allowed:false/);assert.match(source,/pricing_activation_allowed:false/);});
