import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const record=await readFile("scripts/record-avantiqo-music-sfx-matrix-operator-approval-local.mjs","utf8");
const finalize=await readFile("scripts/finalize-avantiqo-music-sfx-certification-matrix-local.mjs","utf8");
const promote=await readFile("scripts/plan-avantiqo-music-sfx-promotion.mjs","utf8");
test("explicit matrix approval never invents numeric scores",()=>{assert.match(record,/numeric_scores_asserted:false/);assert.match(record,/automatic_score_inference_forbidden:true/);assert.match(record,/EXPLICIT_OPERATOR_MATRIX_ATTESTATION/);});
test("matrix finalizer accepts bound operator attestation as qualitative review evidence",()=>{assert.match(finalize,/--operator-approval=/);assert.match(finalize,/MATRIX_OPERATOR_APPROVAL_INVALID/);assert.match(finalize,/numeric_scores_asserted:!operatorApprovalPath/);});
test("promotion accepts qualitative operator matrix approval without fake 92 scores",()=>{assert.match(promote,/EXPLICIT_OPERATOR_MATRIX_ATTESTATION/);assert.match(promote,/SFX_OPERATOR_MATRIX_ATTESTATION_INVALID/);assert.match(promote,/SIX_SCORED_SAMPLE_REVIEWS/);});
