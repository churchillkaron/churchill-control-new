import { test } from "node:test";
import assert from "node:assert/strict";

import {
  crossConversationAmbiguityTurn,
  isCrossConversationContinuationRequest,
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
