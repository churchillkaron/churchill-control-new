import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const replan = fs.readFileSync("lib/operator/runtime/OperatorMissionReplanContinuityRuntime.js", "utf8");
const conversation = fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8");
const turnRoute = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const operator = fs.readFileSync("components/operator/AvantiqoOperator.jsx", "utf8");
const wake = fs.readFileSync("components/operator/LocalHeyAvantiqoWakeBridge.jsx", "utf8");
const eventWorker = fs.readFileSync("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js", "utf8");

const legacy = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");
const humanDecision = fs.readFileSync("lib/operator/runtime/OperatorHumanDecisionClassifier.js", "utf8");

test("voice can replan a blocked mission without forcing a text-channel handoff", () => {
  assert.doesNotMatch(replan, /VOICE_REPLAN_REQUIRES_TEXT_TURN/);
  assert.match(replan, /Do not skip confirmation, approval, permission, wallet, scope, entity, or verification gates/);
  assert.match(replan, /Do not reuse prior approval or confirmation as authority for a replacement mutation/);
  assert.match(replan, /mission_replan_execution_authority:\s*"NONE"/);
});

test("first-party text and voice use the same canonical primary Business Partner conversation", () => {
  assert.match(operator, /conversationKey:\s*"primary"/);
  assert.match(operator, /source:\s*source === "voice" \? "voice" : "text"/);
  assert.match(wake, /conversationKey:\s*"primary"/);
  assert.match(wake, /source:\s*"voice"/);
  assert.match(turnRoute, /text\(body\.conversationKey \|\| body\.conversation_key\) \|\| "primary"/);
});

test("channel changes never recover authorization from project-only cross-conversation continuity", () => {
  assert.match(turnRoute, /authorization-critical Operator state is server-authoritative/i);
  assert.match(turnRoute, /Cross-conversation continuity intentionally recovers project state\s*\n\s*\/\/ only; it never recovers agreement_state/);
  assert.match(conversation, /authorization_server_authoritative:\s*true/);
});

test("voice still cannot inherit mutation consent merely because the mission is continuous", () => {
  assert.match(conversation, /text\(source\)\.toLowerCase\(\) === "voice"\s*\? "unresolved"\s*:\s*"auto_execute"/);
  assert.match(conversation, /VOICE_CONFIRMATION_REQUIRED/);
});

test("event wake-ups resume the exact persisted conversation rather than creating a channel-specific mission", () => {
  assert.match(eventWorker, /\.eq\("id",wait\.conversation_id\)/);
  assert.match(eventWorker, /agreementState:object\(conversation\.agreement_state\)/);
  assert.match(eventWorker, /projectState:object\(conversation\.project_state\)/);
  assert.match(eventWorker, /source:"event"/);
});


test("spoken continuation and confirmation reuse the same governed pending-action classifier", () => {
  assert.match(humanDecision, /if \(RESUME\.has\(clean\)\) return "resume"/);
  assert.match(humanDecision, /return DIRECT_EXECUTE\.has\(clean\) \? "execute" : null/);
  assert.match(legacy, /function normalizedPendingMessage\(message, replyClass\)/);
  assert.match(legacy, /if \(replyClass === "execute"\) return "do it"/);
  assert.match(legacy, /if \(replyClass === "resume"\) return "continue"/);
});
