import assert from "node:assert/strict";
import test from "node:test";

import {
  parseOperatorReasoningResponse,
} from "../lib/operator/runtime/OperatorReasoningResponseParser.js";

test("selects the complete Operator decision from concatenated JSON objects", () => {
  const partial = JSON.stringify({
    execution: {
      capability_key: "platform.product_engineering_cycle.execute",
      payload: { focus: "continue" },
    },
  });
  const complete = {
    response_text: "Starting the bounded Product engineering cycle.",
    intent: "execute",
    confidence: 0.9,
    agreement_state: {},
    project_state: { status: "active" },
    clarification: { required: false, question: null, options: [] },
    navigation: { target_id: null },
    execution: {
      capability_key: "platform.product_engineering_cycle.execute",
      payload: { focus: "continue" },
      reason: "User requested execution.",
    },
    plan: [],
  };

  assert.deepEqual(
    parseOperatorReasoningResponse(`${partial}${JSON.stringify(complete)}`),
    complete,
  );
});

test("parses fenced JSON without accepting surrounding prose as JSON", () => {
  const complete = {
    response_text: "Done.",
    intent: "answer",
    execution: { capability_key: null, payload: {}, reason: null },
  };
  assert.deepEqual(
    parseOperatorReasoningResponse(`note\n\`\`\`json\n${JSON.stringify(complete)}\n\`\`\``),
    complete,
  );
});

test("balanced extraction tolerates braces inside JSON strings", () => {
  const complete = {
    response_text: "Use {current} evidence only.",
    intent: "answer",
    execution: { capability_key: null, payload: {}, reason: null },
  };
  assert.deepEqual(
    parseOperatorReasoningResponse(`prefix ${JSON.stringify(complete)} suffix`),
    complete,
  );
});

test("malformed non-JSON remains rejected", () => {
  assert.equal(parseOperatorReasoningResponse("not a decision {broken"), null);
});
