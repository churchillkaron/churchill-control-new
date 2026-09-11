import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");
const secretary = fs.readFileSync("lib/operator/secretary/SecretaryJobExecutionRuntime.js", "utf8");
const webhook = fs.readFileSync("lib/commercial/communications/CommunicationWebhookRuntime.js", "utf8");
const adapter = fs.readFileSync("lib/operator/runtime/BusinessPartnerBusinessEventAdapterRuntime.js", "utf8");

test("external wait may bind one earlier scalar result while ordinary dynamic action payloads remain blocked", () => {
  assert.match(mission, /resolveExternalWaitCorrelation/);
  assert.match(mission, /correlation_from/);
  assert.match(mission, /OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_STEP_INVALID/);
  assert.match(mission, /OPERATOR_MISSION_EXTERNAL_WAIT_SOURCE_RESULT_NOT_SCALAR/);
  assert.match(mission, /OPERATOR_MISSION_DYNAMIC_RESULT_CHAINING_BLOCKED/);
});

test("Secretary terminal states emit exact no-authority Business Partner events", () => {
  assert.match(secretary, /emitSecretaryJobTerminalEvent/);
  assert.match(secretary, /event_source:\s*"secretary"/);
  assert.match(secretary, /event_type:\s*"JOB_TERMINAL"/);
  assert.match(secretary, /`secretary_job:\$\{jobId\}`/);
  assert.match(secretary, /\["COMPLETED", "FAILED", "CANCELLED"\]/);
  assert.match(secretary, /authorization_effect:\s*"NONE"/);
});
test("communication webhook emits exact inbound reply evidence for Business Partner waits", () => {
  assert.match(webhook, /event_source:\s*`communication:\$\{provider\}`/);
  assert.match(webhook, /event_type:\s*"MESSAGE_RECEIVED"/);
  assert.match(webhook, /`conversation:\$\{conversation\.id\}`/);
  assert.match(webhook, /emitBusinessPartnerBusinessEvent/);
  assert.match(adapter, /authorization_effect:\s*"NONE"/);
});

test("Secretary Commercial Business Partner lifecycle is structurally certified", () => {
  const run = spawnSync(process.execPath, ["scripts/certify-business-partner-secretary-commercial-lifecycle-local.mjs"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.scenario, "SECRETARY_COMMERCIAL_FOLLOW_UP_TO_BUSINESS_PARTNER_RESUME");
  assert.equal(report.certified, true);
  assert.equal(report.failed_stages.length, 0);
  assert.ok(Object.values(report.domain_evidence).every(Boolean));
  assert.equal(report.authorization_effect, "NONE");
});
