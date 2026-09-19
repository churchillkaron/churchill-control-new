import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");

test("Business Partner promotes preview artifacts and persists them with assistant evidence", () => {
  assert.match(route, /collectOperatorPresentationArtifacts/);
  assert.match(route, /presentation_artifacts: presentationArtifacts/);
  assert.match(route, /provider_evidence: normalizedProviderEvidence/);
  assert.match(route, /evidence: normalizedProviderEvidence/);
});
