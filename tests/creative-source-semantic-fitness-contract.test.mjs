import assert from "node:assert/strict";
import fs from "node:fs";

const analyzer = fs.readFileSync("lib/creative/assets/intelligence/analyzeCreativeAsset.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeShotReferenceContractValidator.js", "utf8");
const universal = fs.readFileSync("lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime.js", "utf8");

assert.match(analyzer, /visually_identifiable_location/);
assert.match(analyzer, /visibly_supported_profession/);
assert.match(analyzer, /generic tropical coast must NOT be called Phuket/);
assert.match(analyzer, /generic office, building, laptop, calculator, paperwork or business website image must NOT be called accounting/);
assert.match(analyzer, /High resolution or beauty cannot compensate for wrong location\/profession evidence/);

assert.match(validator, /function visualLocationEvidence/);
assert.match(validator, /visible\.identifiable === true/);
assert.match(validator, /Number\(visible\.confidence \|\| 0\) >= 85/);
assert.match(validator, /visually_identifiable_location: visualLocationEvidence/);

assert.match(universal, /function visualLocationEvidence/);
assert.match(universal, /if \(visualLocationEvidence\(asset\)\)/);
assert.doesNotMatch(universal, /if \(locationObservations\(asset\)\.length\) \{\n    roles\.push\("LOCATION_REFERENCE"\)/);

console.log("CREATIVE_SOURCE_SEMANTIC_FITNESS_CONTRACT=PASS");

assert.match(validator, /SHOT_REFERENCE_LOCATION_CLAIM_NOT_VISUALLY_PROVEN/);
assert.match(validator, /SHOT_REFERENCE_PROFESSION_CLAIM_NOT_VISUALLY_PROVEN/);
assert.match(validator, /validateSemanticClaim/);
