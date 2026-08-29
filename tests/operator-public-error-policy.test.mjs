import assert from "node:assert/strict";
import test from "node:test";

import {
  isOperatorPublicSafeMessage,
  operatorPublicError,
  shouldSanitizeOperatorRuntimeError,
} from "../lib/operator/runtime/OperatorPublicErrorPolicy.js";

test("sanitizes OpenAI max-output token errors", () => {
  const error = new Error("OPENAI_TEXT_RESPONSE_NOT_COMPLETE:max_output_tokens");
  assert.equal(shouldSanitizeOperatorRuntimeError(error), true);
  const result = operatorPublicError(error);
  assert.equal(result.code, "OPERATOR_RESPONSE_LIMIT_REACHED");
  assert.equal(isOperatorPublicSafeMessage(result.message), true);
  assert.equal(result.message.includes("OPENAI"), false);
  assert.equal(result.message.includes("max_output_tokens"), false);
});

test("sanitizes unavailable owned Intelligence without claiming fallback", () => {
  const error = new Error(
    "No priced executable provider available for ai.text.generate; rejected=avantiqo-intelligence:OWNED_EXECUTION_NOT_CERTIFIED",
  );
  assert.equal(shouldSanitizeOperatorRuntimeError(error), true);
  const result = operatorPublicError(error);
  assert.equal(result.code, "OPERATOR_OWNED_INTELLIGENCE_UNAVAILABLE");
  assert.match(result.message, /owned intelligence is temporarily unavailable/i);
  assert.match(result.message, /didn't use an external AI fallback/i);
});

test("sanitizes provider transport errors", () => {
  const error = new Error("OPENAI_REQUEST_FAILED:502:upstream error");
  assert.equal(shouldSanitizeOperatorRuntimeError(error), true);
  const result = operatorPublicError(error);
  assert.equal(result.code, "OPERATOR_PROVIDER_UNAVAILABLE");
  assert.equal(isOperatorPublicSafeMessage(result.message), true);
});

test("does not swallow normal business-control errors", () => {
  const error = new Error("INSUFFICIENT_WALLET_BALANCE");
  assert.equal(shouldSanitizeOperatorRuntimeError(error), false);
});

test("does not swallow arbitrary governance errors", () => {
  const error = new Error("OWNER_APPROVAL_REQUIRED");
  assert.equal(shouldSanitizeOperatorRuntimeError(error), false);
});
