import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("operator read-tool bridge defines evidence scope and research routing before use", () => {
  const source = fs.readFileSync(
    "lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js",
    "utf8",
  );

  const scopeIndex = source.indexOf(
    'const normalizedEvidenceScope = text(evidenceScope, 80).toLowerCase();',
  );
  const researchIndex = source.indexOf("const researchRequested =");
  const firstUseIndex = source.indexOf("fastResolution.strong && !researchRequested");

  assert.ok(scopeIndex >= 0);
  assert.ok(researchIndex > scopeIndex);
  assert.ok(firstUseIndex > researchIndex);
  assert.match(source, /normalizedEvidenceScope === "external"/);
  assert.match(source, /normalizedEvidenceScope === "internal"/);
  assert.match(source, /externalResearchRequested\(message\)/);
});
