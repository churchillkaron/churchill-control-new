import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");

test("master-plan reasoning transport deduplicates canonical role schema", () => {
  assert.match(source, /function compactAgencyRoleSchemaForReasoning\(\)/);
  assert.match(source, /decision_record_contract:/);
  assert.match(source, /roles: Object\.fromEntries/);
  assert.match(source, /CREATIVE_MASTER_PLAN_ROLES\.map/);
  assert.match(source, /role_decisions must be one object keyed by every exact role id above/);
});

test("master-plan reasoning sends only the operative workflow contract with bounded prose", () => {
  assert.match(source, /const MASTER_PLAN_TRANSPORT_TEXT_LIMIT = 240/);
  assert.match(source, /function compactContractForReasoning/);
  assert.match(source, /workflow_contracts: workflowContracts/);
  assert.match(source, /text\(entry\?\.workflow_kind\)\.toUpperCase\(\) === operative/);
  assert.match(source, /compactInstructionText\(value\)/);
});

test("execution checklist does not repeat role mandates already present in agency role schema", () => {
  const roleStart = source.indexOf("function roleChecklist");
  const roleEnd = source.indexOf("function strictRoleDecisionSchema", roleStart);
  const roleBlock = source.slice(roleStart, roleEnd);
  assert.doesNotMatch(roleBlock, /mandate: role\.mandate/);
  assert.match(roleBlock, /role_id: role\.id/);
  assert.match(roleBlock, /eligible:/);
});

test("full capability objects are not duplicated beside exact allowed capability pairs", () => {
  assert.match(source, /production_capability_authority:/);
  assert.match(source, /execution_checklist\.allowed_service_capability_pairs/);
  const decisionStart = source.indexOf("function decisionRequest");
  const decisionEnd = source.indexOf("function operativeWorkflowInstructions", decisionStart);
  const decisionBlock = source.slice(decisionStart, decisionEnd);
  assert.doesNotMatch(decisionBlock, /context:[\s\S]*available_production_capabilities,/);
});
