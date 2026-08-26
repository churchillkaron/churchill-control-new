import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  evaluateOperatorIntelligenceExecutionGuard,
  operatorIntelligenceMutationBlock,
  runWithOperatorIntelligenceExecutionGuard,
} from "../lib/operator/runtime/OperatorIntelligenceExecutionGuardRuntime.js";

const operatorWrapperSource = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorTurnRuntime.js", import.meta.url),
  "utf8",
);
const governanceSource = fs.readFileSync(
  new URL("../lib/operator/governance/operatorExecutionGovernance.js", import.meta.url),
  "utf8",
);

function briefMessage(overrides = {}) {
  const brief = {
    planning_complete: true,
    execution_guidance_allowed: true,
    cognitive_plan: { status: "PLAN_VALIDATED" },
    governed_plan: { valid: true },
    ...overrides,
  };
  return {
    role: "assistant",
    content: `AVANTIQO_OWNED_COGNITIVE_BRIEF_V4\n${JSON.stringify(brief)}`,
  };
}

test("complex turn with missing cognitive brief fails closed for mutations", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: [],
  });
  assert.equal(guard.mutating_execution_allowed, false);
  assert.equal(guard.reason, "COGNITIVE_BRIEF_REQUIRED_UNAVAILABLE");

  runWithOperatorIntelligenceExecutionGuard(guard, () => {
    const blocked = operatorIntelligenceMutationBlock({
      key: "finance.invoice.create",
      mode: "write",
    });
    assert.equal(blocked?.blocked, true);
    assert.equal(blocked?.reason, "COGNITIVE_BRIEF_REQUIRED_UNAVAILABLE");
  });
});

test("invalid cognitive plan fails closed for mutations but never blocks reads", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: [
      briefMessage({
        planning_complete: false,
        execution_guidance_allowed: false,
        cognitive_plan: { status: "PLAN_REJECTED_INVALID_GRAPH" },
        governed_plan: { valid: false },
      }),
    ],
  });
  assert.equal(guard.reason, "COGNITIVE_PLAN_NOT_VALIDATED");

  runWithOperatorIntelligenceExecutionGuard(guard, () => {
    assert.equal(
      operatorIntelligenceMutationBlock({ key: "finance.invoice.read", mode: "read" }),
      null,
    );
    assert.equal(
      operatorIntelligenceMutationBlock({ key: "finance.invoice.create", mode: "write" })?.blocked,
      true,
    );
  });
});

test("validated governed cognitive plan permits normal downstream mutation governance", () => {
  const guard = evaluateOperatorIntelligenceExecutionGuard({
    required: true,
    conversation: [briefMessage()],
  });
  assert.equal(guard.cognitive_plan_valid, true);
  assert.equal(guard.mutating_execution_allowed, true);

  runWithOperatorIntelligenceExecutionGuard(guard, () => {
    assert.equal(
      operatorIntelligenceMutationBlock({ key: "finance.invoice.create", mode: "write" }),
      null,
    );
  });
});

test("canonical Operator wrapper and execution governance enforce the guard before UBTE", () => {
  assert.match(operatorWrapperSource, /needsOwnedCognitiveBrief/);
  assert.match(operatorWrapperSource, /runWithOperatorIntelligenceExecutionGuard/);
  assert.match(operatorWrapperSource, /stagedMutationRequiresCognitiveBlock/);
  assert.match(operatorWrapperSource, /pending_execution_created:\s*false/);
  assert.match(governanceSource, /enforceOperatorIntelligenceMutationGuard\(capability\)/);

  const approvalFunctionStart = governanceSource.indexOf(
    "export async function resolveOperatorExecutionApproval",
  );
  const auditFunctionStart = governanceSource.indexOf(
    "export async function recordOperatorExecutionAudit",
  );
  assert.ok(approvalFunctionStart >= 0);
  assert.ok(auditFunctionStart > approvalFunctionStart);

  const approvalFunctionSource = governanceSource.slice(
    approvalFunctionStart,
    auditFunctionStart,
  );
  const guardIndex = approvalFunctionSource.indexOf(
    "enforceOperatorIntelligenceMutationGuard(capability)",
  );
  const durableApprovalIndex = approvalFunctionSource.indexOf(
    "if (!requiresDurableApproval(capability))",
  );
  const approvalCreationIndex = approvalFunctionSource.indexOf(
    "createApprovalRequest({",
  );

  assert.ok(guardIndex >= 0);
  assert.ok(durableApprovalIndex > guardIndex);
  assert.ok(approvalCreationIndex > guardIndex);
});
