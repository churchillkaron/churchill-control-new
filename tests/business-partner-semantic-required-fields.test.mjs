import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js", "utf8");

test("semantic action preparation deterministically checks required business fields before staging", () => {
  assert.match(source, /function missingRequiredActionFields\(action, payload\)/);
  assert.match(source, /list\(schema\.required\)/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(candidate, field\)/);
  const check = source.indexOf("const missingRequiredFields = missingRequiredActionFields(action, payload)");
  const staged = source.indexOf('intent: "execute"', check);
  assert.ok(check >= 0 && staged > check);
});

test("server-injected scope fields are not incorrectly requested from the human", () => {
  assert.match(source, /CONTEXT_PAYLOAD_FIELDS/);
  assert.match(source, /organization_id/);
  assert.match(source, /entity_id/);
  assert.match(source, /period_id/);
  assert.match(source, /operator_party_id/);
});

test("missing required fields produce clarification with zero mutation authority", () => {
  assert.match(source, /stage: "required_fields_missing"/);
  assert.match(source, /missing_required_fields: missingRequiredFields/);
  assert.match(source, /mutation_candidate_created: false/);
  assert.match(source, /authorization_effect: "NONE"/);
});
