import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const mission = read("lib/platform/capabilities/createOperatorMissionCapability.js");
const worker = read("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js");
const approval = read("lib/shared/approvals/executeApproval.js");
const rejection = read("lib/shared/approvals/rejectApprovalRequest.js");
const governance = read("lib/operator/governance/operatorExecutionGovernance.js");

test("awaiting approval missions register exact grant and rejection wake evidence", () => {
  assert.match(mission, /registerApprovalDecisionWaits/);
  assert.match(mission, /\["APPROVAL_GRANTED", "APPROVAL_REJECTED"\]/);
  assert.match(mission, /approval_request:\$\{approvalRequestId\}/);
  assert.match(mission, /approval_auto_resume_registered/);
});

test("approval events wake only the exact approval request and grant no authority", () => {
  assert.match(approval, /event_type:\s*"APPROVAL_GRANTED"/);
  assert.match(rejection, /event_type:\s*"APPROVAL_REJECTED"/);
  assert.match(approval, /`approval_request:\$\{workflowRequestId\}`/);
  assert.match(rejection, /`approval_request:\$\{workflowRequestId\}`/);
});

test("worker accepts awaiting approval binding then cancels the unused sibling wait", () => {
  assert.match(worker, /text\(run\.status,80\)\.toLowerCase\(\) === "awaiting_approval"/);
  assert.match(worker, /text\(currentStep\?\.approval_request_id,180\) === approvalRequestId/);
  assert.match(worker, /cancelApprovalSiblingWaits/);
  assert.match(worker, /CANCELLED_SIBLING_APPROVAL_WAIT/);
});

test("current approval row remains authority after wake", () => {
  assert.match(governance, /resolveExistingApprovalRequest/);
  assert.match(governance, /status === "approved"/);
  assert.match(governance, /APPROVAL_REJECTED/);
  assert.match(worker, /message:"continue"/);
});

test("approval continuation certification is structurally green", () => {
  const run = spawnSync(process.execPath, ["scripts/certify-business-partner-approval-continuation-local.mjs"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.scenario, "BUSINESS_PARTNER_EXACT_APPROVAL_AUTO_CONTINUATION");
  assert.equal(report.certified, true);
  assert.deepEqual(report.failed_stages, []);
  assert.ok(Object.values(report.domain_evidence).every((value) => value === true));
});
