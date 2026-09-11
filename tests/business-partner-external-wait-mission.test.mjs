import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");
const run = fs.readFileSync("lib/operator/contracts/OperatorAutonomousRun.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const worker = fs.readFileSync("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js", "utf8");
const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("mission engine owns external wait checkpoint creation", () => {
  assert.match(mission, /EXTERNAL_WAIT_KEY = "platform\.business_partner_external_wait\.execute"/);
  assert.match(mission, /AVANTIQO_OPERATOR_MISSION_EXTERNAL_WAIT/);
  assert.match(mission, /executeUbteCapability/);
  assert.match(mission, /mission_checkpoint: \{/);
  assert.match(mission, /\.\.\.checkpoint/);
  assert.match(mission, /pauseReason: "external"/);
  assert.match(mission, /operator_mission_\$\{crypto\.randomUUID\(\)\}/);
});

test("external wait is a first class resumable mission state", () => {
  assert.match(run, /"waiting_external"/);
  assert.match(core, /runStatus === "waiting_external"/);
  assert.match(core, /status === "waiting_external"/);
  assert.match(core, /continue automatically when the exact registered external event arrives/);
  assert.match(core, /resumeRunId/);
});

test("wait correlation is part of exact mission binding", () => {
  assert.match(core, /wait_for_external:/);
  assert.match(core, /event_source: text\(wait\.event_source\)/);
  assert.match(core, /event_type: text\(wait\.event_type\)/);
  assert.match(core, /correlation_key: text\(wait\.correlation_key\)/);
});

test("event worker reacquires live access and persists the real conversation", () => {
  assert.match(worker, /resolveDelegatedOrganizationAccess/);
  assert.match(worker, /created_by_user_id/);
  assert.match(worker, /runSyntheticIntelligenceTurn/);
  assert.match(worker, /source:"event"/);
  assert.match(worker, /persistAssistantTurnAndConversationState/);
  assert.match(worker, /attempt_count/);
  assert.match(route, /conversationId: memory\.conversation\.id/);
});

test("external wait worker is cron protected and scheduled", () => {
  assert.match(vercel, /app\/api\/internal\/operator\/external-waits\/process\/route\.js/);
  assert.match(vercel, /\/api\/internal\/operator\/external-waits\/process/);
});

test("late events cannot revive a superseded or cancelled mission", () => {
  assert.match(worker, /activeWaitBinding/);
  assert.match(worker, /run\.status,80\)\.toLowerCase\(\) === "waiting_external"/);
  assert.match(worker, /pending\.capability_key,300\) === "platform\.operator_mission\.execute"/);
  assert.match(worker, /WAIT_NO_LONGER_ACTIVE/);
  assert.match(worker, /"CANCELLED"/);
});
