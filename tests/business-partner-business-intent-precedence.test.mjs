import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const understanding = fs.readFileSync(
  "lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js",
  "utf8",
);
const fast = fs.readFileSync(
  "lib/operator/runtime/OperatorFastConversationRuntime.js",
  "utf8",
);

test("verified business-write continuity can upgrade a weak semantic classification into a governed revision", () => {
  assert.match(understanding, /const durableBusinessRevision =/);
  assert.match(understanding, /execution_domain: "business"/);
  assert.match(understanding, /route: "governed"/);
  assert.match(understanding, /goal_relation: "revise"/);
  assert.match(understanding, /requires_mutation: true/);
});

test("business mutation semantics outrank inherited product inspection", () => {
  assert.match(fast, /const semanticBusinessMutation = Boolean\(/);
  assert.match(fast, /!semanticBusinessMutation/);
  const business = fast.indexOf("const semanticBusinessMutation = Boolean(");
  const product = fast.indexOf("const semanticProductInspectionEvidence = Boolean(");
  assert.ok(business >= 0 && product > business);
});

test("understanding continuity is generic rather than invoice-specific", () => {
  assert.doesNotMatch(understanding, /Moonshine|INV-26090003|Trio band|Full band/);
});
