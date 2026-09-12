import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner fast lane uses an interactive settlement budget", () => {
  const reasoning = source("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js");
  const owned = source("lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js");
  assert.match(reasoning, /FAST_PENDING_SETTLEMENT_DEADLINE_MS = 35_000/);
  assert.match(reasoning, /FAST_PENDING_QUEUE_GRACE_MS = 10_000/);
  assert.match(owned, /DEFAULT_FRONT_MAX_POLLS = 20/);
  assert.match(owned, /DEFAULT_FAST_MAX_POLLS = 45/);
  assert.match(owned, /executionLane === "front"/);
  assert.match(owned, /DEFAULT_FRONT_MAX_POLLS/);
  assert.match(owned, /DEFAULT_DEEP_MAX_POLLS/);
});

test("Business Partner retries a stalled fast reasoning job once inside the same turn", () => {
  const fast = source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  assert.match(fast, /function fastIntelligenceTimeout/);
  assert.match(fast, /FAST_INTELLIGENCE_RETRY/);
  assert.match(fast, /liveReadReceipts\.length = 0/);
  assert.match(fast, /evidenceExecution = await runEvidenceTurn\(\)/);
  assert.match(fast, /execution = await runFastGeneration\(\)/);
  assert.match(fast, /No business action is being replayed/);
});

test("terminal fast timeout returns recoverable conversation instead of a generic dead end", () => {
  const route = source("app/api/operator/turn/route.js");
  assert.match(route, /isFastIntelligenceSettlementTimeout/);
  assert.match(route, /conversation_response/);
  assert.match(route, /conversation_preserved: true/);
  assert.match(route, /business_action_replayed: false/);
  assert.match(route, /mutation_assumed_complete: false/);
});

test("Business Partner renders live execution as ephemeral gray status only", () => {
  const ui = source("components/operator/HomeAvantiqoIntelligence.jsx");
  const route = source("app/api/operator/turn/route.js");
  parse(ui, { sourceType: "module", plugins: ["jsx"] });
  assert.match(ui, /conversationalProgressStatus/);
  assert.match(ui, /data-avantiqo-live-status="true"/);
  assert.match(ui, /text-white\/35/);
  assert.match(ui, /latest\?\.description/);
  assert.match(ui, /latest\?\.capability_key/);
  assert.match(ui, /latest\?\.command/);
  assert.doesNotMatch(ui, /Still working on the same request\. Waiting for a verified result/);
  assert.match(ui, /result\?\.details\?\.conversation_response/);
  assert.doesNotMatch(ui, /data-avantiqo-conversation-progress="true"/);
  assert.doesNotMatch(ui, /busyRequestStatus\(/);
  assert.match(route, /persistAssistantTurnAndConversationState/);
  assert.doesNotMatch(route, /persistAssistantTurnAndConversationState\([\s\S]{0,500}live_execution/);
});
