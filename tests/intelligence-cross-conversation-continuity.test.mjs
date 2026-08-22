import { test } from "node:test";
import assert from "node:assert/strict";

import {
  crossConversationAmbiguityTurn,
  isCrossConversationContinuationRequest,
  selectContinuityProjectCandidates,
} from "../lib/operator/runtime/IntelligenceCrossConversationContinuityRuntime.js";

test("recognizes short continuation requests", () => {
  for (const message of [
    "continue",
    "next",
    "keep going",
    "continue where we left off",
    "what's next",
  ]) {
    assert.equal(isCrossConversationContinuationRequest(message), true, message);
  }
});

test("does not treat normal new requests as continuation", () => {
  assert.equal(
    isCrossConversationContinuationRequest("Create a new customer invoice"),
    false,
  );
  assert.equal(
    isCrossConversationContinuationRequest("What is revenue today?"),
    false,
  );
});

test("clearly newer unfinished project wins over stale project", () => {
  const latest = Date.parse("2026-08-22T10:00:00.000Z");
  const stale = Date.parse("2026-07-20T10:00:00.000Z");
  const result = selectContinuityProjectCandidates([
    { conversation_id: "new", updated_at_ms: latest },
    { conversation_id: "old", updated_at_ms: stale },
  ]);

  assert.equal(result.ambiguous, false);
  assert.equal(result.selected.conversation_id, "new");
  assert.equal(result.reason, "CLEARLY_NEWER_ACTIVE_PROJECT_RECOVERED");
});

test("two recently active projects remain ambiguous", () => {
  const latest = Date.parse("2026-08-22T10:00:00.000Z");
  const recent = Date.parse("2026-08-18T10:00:00.000Z");
  const result = selectContinuityProjectCandidates([
    { conversation_id: "a", updated_at_ms: latest },
    { conversation_id: "b", updated_at_ms: recent },
  ]);

  assert.equal(result.ambiguous, true);
  assert.equal(result.selected, null);
  assert.equal(result.reason, "MULTIPLE_RECENT_ACTIVE_PROJECTS");
});

test("ambiguous project recovery asks instead of guessing", () => {
  const result = crossConversationAmbiguityTurn({
    recovery: {
      projects: [
        {
          conversation_id: "project-a",
          objective: "Finish Synthetic Intelligence",
          next_step: "Build continuity",
        },
        {
          conversation_id: "project-b",
          objective: "Finish investor film",
          next_step: "Assemble final scenes",
        },
      ],
    },
    agreementState: {},
  });

  assert.equal(result.decision.intent, "clarify");
  assert.equal(result.decision.clarification.required, true);
  assert.equal(result.decision.clarification.options.length, 2);
  assert.equal(result.project_continuity.authorization_recovered, false);
  assert.equal(result.project_continuity.mutable_business_evidence_recovered, false);
});

test("ambiguous project recovery never emits execution", () => {
  const result = crossConversationAmbiguityTurn({
    recovery: {
      projects: [
        { conversation_id: "a", objective: "Project A" },
        { conversation_id: "b", objective: "Project B" },
      ],
    },
  });

  assert.equal(result.execution, null);
  assert.equal(result.decision.execution.capability_key, null);
  assert.deepEqual(result.decision.execution.payload, {});
});
