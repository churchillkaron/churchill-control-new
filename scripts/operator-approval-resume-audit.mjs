#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [governanceSource, turnSource] = await Promise.all([
  readFile("lib/operator/governance/operatorExecutionGovernance.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
]);

function requireAll(label, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.includes(fragment),
      `${label} missing required contract fragment: ${fragment}`,
    );
  }
}

requireAll("EXACT_APPROVAL_LOOKUP", governanceSource, [
  "approvalRequestId = null",
  '.from("approval_requests")',
  '.eq("id", requestId)',
  '.eq("organization_id", organizationId)',
  '.from("approval_workflows")',
  'const expectedWorkflowType = `operator.${capability.key}`',
  'reason: "APPROVAL_REQUEST_MISMATCH"',
]);

requireAll("APPROVAL_LIFECYCLE", governanceSource, [
  'if (status === "approved")',
  'reason: "APPROVAL_REJECTED"',
  'reason: "APPROVAL_REQUIRED"',
  "return resolveExistingApprovalRequest({",
]);

requireAll("NO_DUPLICATE_RESUME_REQUEST", governanceSource, [
  "if (text(approvalRequestId))",
  "return resolveExistingApprovalRequest({",
  "const approvalRequest = await createApprovalRequest({",
]);

requireAll("PENDING_APPROVAL_BINDING", turnSource, [
  "approval_request_id: text(candidate.approval_request_id) || null",
  "function agreementWithApprovalRequest(agreementState, approvalRequest)",
  "approval_request_id: approvalRequestId",
  "approvalRequestId: pending.approval_request_id",
]);

requireAll("DIRECT_APPROVAL_PAUSE_PERSISTENCE", turnSource, [
  "const pendingApprovalState = agreementWithPendingConfirmationRun({",
  "approvalRequestId: governance.approvalRequest?.id",
  "const governanceState = approvalRunTransition(",
  "agreement_state: governanceState",
]);

requireAll("REJECTION_FAILS_CLOSED", turnSource, [
  "const TERMINAL_APPROVAL_FAILURE_REASONS = new Set([",
  '"APPROVAL_REJECTED"',
  '"APPROVAL_REQUEST_NOT_FOUND"',
  '"APPROVAL_REQUEST_MISMATCH"',
  'status: terminalFailure ? "blocked" : "awaiting_approval"',
]);

console.log("OPERATOR_APPROVAL_RESUME_AUDIT=PASS");
console.log("OPERATOR_APPROVAL_BINDING=EXACT_REQUEST_ID");
console.log("OPERATOR_APPROVAL_RESUME=RECHECK_SAME_REQUEST");
console.log("OPERATOR_APPROVAL_DUPLICATE_REQUEST_ON_RESUME=FORBIDDEN");
console.log("OPERATOR_APPROVAL_REJECTED=FAIL_CLOSED");
console.log("OPERATOR_APPROVAL_MISMATCH=FAIL_CLOSED");
