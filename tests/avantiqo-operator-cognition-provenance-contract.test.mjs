import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provenance = await readFile(
  new URL("../lib/operator/runtime/OperatorIntelligenceProvenanceRuntime.js", import.meta.url),
  "utf8",
);
const synthetic = await readFile(
  new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
  "utf8",
);

assert.match(provenance, /AVANTIQO_OPERATOR_COGNITION_PROVENANCE_V1/);
assert.match(provenance, /OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence"/);
assert.match(provenance, /external_cognition_selected/);
assert.match(provenance, /console\.info\("AVANTIQO_OPERATOR_COGNITION_PROVENANCE"/);
assert.doesNotMatch(provenance, /response_text/);
assert.match(synthetic, /OperatorIntelligenceProvenanceRuntime\.record/);
assert.doesNotMatch(synthetic, /intelligence_supervision:\s*\{[^}]*provider:/s);
assert.doesNotMatch(synthetic, /intelligence_supervision:\s*\{[^}]*model:/s);

console.log("PASS avantiqo operator cognition provenance remains internal");
