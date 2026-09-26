import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const prep = fs.readFileSync("lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("semantic mutation planning and materialization are explicitly owned-local with no fast escalation", () => {
  const plan = prep.slice(prep.indexOf("operation: \"SEMANTIC_BUSINESS_ACTION_PLAN\""), prep.indexOf("async function executePlannedReads"));
  const materialize = prep.slice(prep.indexOf("operation: \"SEMANTIC_BUSINESS_ACTION_MATERIALIZE\""), prep.indexOf("export async function prepareSemanticGovernedAction"));
  assert.match(plan, /allow_fast_escalation: false/);
  assert.match(materialize, /allow_fast_escalation: false/);
});

test("malformed semantic plan or materialization never becomes an empty execution payload", () => {
  assert.match(prep, /stage: "plan_invalid"/);
  assert.match(prep, /stage: "materialization_invalid"/);
  assert.match(prep, /mutation_candidate_created: false/);
  const invalid = prep.indexOf('stage: "materialization_invalid"');
  const payload = prep.indexOf("const payload = object(payloadPlan.payload)");
  assert.ok(invalid >= 0 && payload > invalid);
});

test("governed single mutation cannot fall through to generic reasoner when semantic preparation fails", () => {
  assert.match(core, /const governedSingleMutation = Boolean/);
  assert.match(core, /SEMANTIC_ACTION_PREPARATION_FAILED_CLOSED/);
  assert.match(core, /semantic_action_preparation_failed_closed: true/);
  assert.match(core, /mutation_candidate_created: false/);
  const failClosed = core.indexOf("const semanticMutationFailClosed");
  const generic = core.indexOf("await reasonAboutOperatorTurn({", failClosed);
  assert.ok(failClosed >= 0 && generic > failClosed);
  assert.match(core, /semanticPreparation \|\| semanticMutationFailClosed \|\| await reasonAboutOperatorTurn/);
});
