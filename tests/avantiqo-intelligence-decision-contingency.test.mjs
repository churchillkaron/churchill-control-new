import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceDecisionContingency,
  OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionContingencyRuntime.js";

function decision(overrides = {}) {
  return { candidate_id: "option-a", mutates: false, reversible: true, ...overrides };
}
function provenance(overrides = {}) {
  return { invalidation_triggers: [{ id: "condition-a", type: "VALIDITY_CONDITION_INVALID", reasons: [] }], ...overrides };
}
function mode(overrides = {}) {
  return {
    id: "condition-failure",
    title: "Known validity condition changes",
    severity: "high",
    likelihood: "possible",
    decision_invalidating: true,
    trigger_ids: ["condition-a"],
    detection: { signals: ["Current verified read shows condition changed"] },
    prevention: { controls: ["Revalidate before relying on the decision"] },
    recovery: { type: "replan", steps: ["Replan from changed evidence"], verification_criteria: ["New decision passes current validity"] },
    ...overrides,
  };
}

test("contingency exposes canonical contract without execution authority", () => {
  const result = assessOperatorIntelligenceDecisionContingency({ decision: decision(), provenance: provenance(), failure_modes: [mode()] });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_CONTRACT);
  assert.equal(result.status, "CONTINGENCY_READY");
  assert.equal(result.contingency_ready, true);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
});

test("known provenance invalidation trigger must be mapped", () => {
  const result = assessOperatorIntelligenceDecisionContingency({ decision: decision(), provenance: provenance(), failure_modes: [mode({ trigger_ids: [] })] });
  assert.equal(result.status, "UNMAPPED_INVALIDATION_TRIGGERS");
  assert.equal(result.contingency_ready, false);
  assert.equal(result.unmapped_invalidation_triggers[0]?.id, "condition-a");
});

test("high severity material failure without detection or recovery blocks readiness", () => {
  const result = assessOperatorIntelligenceDecisionContingency({
    decision: decision(),
    provenance: { invalidation_triggers: [] },
    failure_modes: [mode({ trigger_ids: [], detection: {}, recovery: {}, severity: "critical" })],
  });
  assert.equal(result.status, "CRITICAL_CONTINGENCY_GAPS");
  assert.ok(result.failure_modes[0]?.issues.includes("MATERIAL_FAILURE_DETECTION_REQUIRED"));
  assert.ok(result.failure_modes[0]?.issues.includes("MATERIAL_FAILURE_RECOVERY_REQUIRED"));
});

test("recovery without verification criteria is not contingency ready", () => {
  const result = assessOperatorIntelligenceDecisionContingency({
    decision: decision(),
    provenance: provenance(),
    failure_modes: [mode({ recovery: { type: "replan", steps: ["Replan"] } })],
  });
  assert.equal(result.status, "CRITICAL_CONTINGENCY_GAPS");
  assert.ok(result.failure_modes[0]?.issues.includes("RECOVERY_VERIFICATION_CRITERIA_REQUIRED"));
});

test("irreversible decision cannot pretend rollback is available", () => {
  const result = assessOperatorIntelligenceDecisionContingency({
    decision: decision({ mutates: true, reversible: false, irreversible: true }),
    provenance: provenance(),
    failure_modes: [mode({ recovery: { type: "rollback", rollback_available: true, requires_human: true, steps: ["Rollback"], verification_criteria: ["Previous state restored"] } })],
  });
  assert.equal(result.status, "CRITICAL_CONTINGENCY_GAPS");
  assert.ok(result.failure_modes[0]?.issues.includes("IRREVERSIBLE_DECISION_CANNOT_CLAIM_ROLLBACK_RECOVERY"));
});

test("mutating recovery remains human governed", () => {
  const result = assessOperatorIntelligenceDecisionContingency({
    decision: decision({ mutates: true }),
    provenance: provenance(),
    failure_modes: [mode({ recovery: { type: "replan", requires_human: false, steps: ["Apply recovery change"], verification_criteria: ["Recovery verified"] } })],
  });
  assert.equal(result.status, "CRITICAL_CONTINGENCY_GAPS");
  assert.ok(result.failure_modes[0]?.issues.includes("MUTATING_OR_IRREVERSIBLE_RECOVERY_REQUIRES_HUMAN_GOVERNANCE"));
});

test("planning tool exposes contingency assessment without execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V12/);
  assert.match(source, /"assess_contingency"/);
  assert.match(source, /decision_contingency_contract/);
  assert.match(source, /deterministic_decision_contingency_assessment/);
  assert.match(source, /provenance_invalidation_triggers_must_be_mapped/);
  assert.match(source, /executes_business_actions: false/);
});
