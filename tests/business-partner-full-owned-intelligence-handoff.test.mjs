import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Business Partner browser and route preserve canonical business context into Synthetic Intelligence", () => {
  const ui = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const route = source("app/api/operator/turn/route.js");

  assert.match(ui, /useBusinessContext\(\)/);
  assert.match(ui, /"\/api\/operator\/turn"/);
  assert.match(
    ui,
    /body:\s*JSON\.stringify\(\{[\s\S]*organizationId,[\s\S]*entityId,[\s\S]*periodId,[\s\S]*message,[\s\S]*source/,
  );
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /resolveBusinessContext\(/);
  assert.match(
    route,
    /runSyntheticIntelligenceTurn\(\{[\s\S]*organizationId:\s*businessContext\.organizationId[\s\S]*entityId:\s*businessContext\.entityId[\s\S]*periodId:\s*businessContext\.periodId[\s\S]*partyId,[\s\S]*actor,[\s\S]*callerRequest:\s*request/,
  );
  assert.match(
    route,
    /const agreementState = object\(memory\.agreementState\)/,
  );
  assert.doesNotMatch(
    route,
    /agreementState\s*=\s*object\(body\.agreementState/,
  );
});

test("Owned cognition may read and validate candidates but cannot gain mutation authority", () => {
  const synthetic = source("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
  const planning = source("lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js");
  const readBridge = source("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js");
  const candidate = source("lib/operator/runtime/OperatorIntelligenceActionCandidateRuntime.js");

  assert.match(synthetic, /OperatorIntelligencePlanningToolRuntime\.createTools\(/);
  assert.match(synthetic, /Use operator_live_read when current business or platform evidence materially improves the decision/);
  assert.match(synthetic, /validate the exact action and payload first with operator_action_candidate/);
  assert.match(synthetic, /authorization:\s*\{\s*allow_mutating_tools:\s*false\s*\}/);
  assert.match(synthetic, /Do not execute writes or claim that any mutation happened in this phase/);
  assert.match(synthetic, /const operatorResult = await runOperatorTurn\(/);
  assert.match(synthetic, /execution_governance_bypassed:\s*false/);

  assert.match(planning, /OperatorIntelligenceToolBridgeRuntime\.createReadTools/);
  assert.match(planning, /OperatorIntelligenceActionCandidateRuntime\.createTools/);

  assert.match(readBridge, /mode !== "read"/);
  assert.match(readBridge, /readOnly:\s*true/);
  assert.match(readBridge, /mutation_possible:\s*false/);
  assert.match(readBridge, /organizationId:\s*organization/);
  assert.match(readBridge, /entityId:\s*context\.entityId/);
  assert.match(readBridge, /periodId:\s*context\.periodId/);

  assert.match(candidate, /candidate_only:\s*true/);
  assert.match(candidate, /executed:\s*false/);
  assert.match(candidate, /persisted:\s*false/);
  assert.match(candidate, /normal_operator_governance_required:\s*true/);
});

test("Every owned reasoning phase stays fail-closed and Operator retains execution and Code authority", () => {
  const structured = source("lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js");
  const reasoning = source("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js");
  const operator = source("lib/operator/runtime/OperatorTurnRuntime.js");

  assert.match(structured, /AvantiqoIntelligenceReasoningRuntime\.run\(/);
  assert.match(structured, /name:\s*"reason_act_observe"/);
  assert.match(structured, /name:\s*"critique_repair"/);
  assert.match(structured, /name:\s*"contract_compile"/);

  assert.match(reasoning, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
  assert.match(
    reasoning,
    /provider_policy:\s*\{[\s\S]*allowed_providers:\s*\[OWNED_PROVIDER\][\s\S]*owned_only_required:\s*true[\s\S]*external_fallback_allowed:\s*false/,
  );
  assert.match(reasoning, /assertOwnedProvider\(execution\?\.provider,\s*"EXECUTION"\)/);
  assert.match(reasoning, /authorization:\s*object\(authorization\)/);
  assert.match(reasoning, /mutates:\s*semantics\.mutates/);

  assert.match(operator, /runGovernedOperatorTurn/);
  assert.match(operator, /evaluateOperatorIntelligenceExecutionGuard/);
  assert.match(operator, /stagedMutationRequiresCognitiveBlock/);
  assert.match(operator, /withVerifiedMutationOutcome/);
  assert.match(operator, /withCodeCustomerArtifactReply/);
  assert.match(operator, /mutation_execution_allowed:\s*false/);
});