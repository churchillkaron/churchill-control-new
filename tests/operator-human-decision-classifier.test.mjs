import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPendingOperatorReply,
} from "../lib/operator/runtime/OperatorHumanDecisionClassifier.js";

function classify(message, options = {}) {
  return classifyPendingOperatorReply({
    message,
    pending: options.pending ?? true,
    recommendation: options.recommendation ?? false,
  });
}

test("continuation words do nothing when no action is pending", () => {
  assert.equal(classify("next", { pending: false }), null);
  assert.equal(classify("continue", { pending: false }), null);
});

test("continuation words resume an exact paused mission", () => {
  for (const message of [
    "next",
    "next step",
    "continue",
    "continue now",
    "keep going",
    "resume",
  ]) {
    assert.equal(
      classify(message),
      "resume",
      `${message} should resume a pending durable mission`,
    );
  }
});

test("continuation words execute the exact pending recommendation", () => {
  for (const message of [
    "next",
    "next step",
    "continue",
    "continue now",
    "keep going",
    "resume",
    "do it",
  ]) {
    assert.equal(
      classify(message, { recommendation: true }),
      "execute",
      `${message} should execute an already-selected pending recommendation`,
    );
  }
});

test("a plain yes agrees with a recommendation but directly confirms a pending action", () => {
  assert.equal(classify("yes", { recommendation: true }), "agree");
  assert.equal(classify("yes", { recommendation: false }), "execute");
});

test("explicit execution language executes a recommendation", () => {
  assert.equal(classify("do it", { recommendation: true }), "execute");
  assert.equal(classify("yes proceed", { recommendation: true }), "execute");
});

test("rejection always wins over recommendation or resume semantics", () => {
  for (const recommendation of [false, true]) {
    assert.equal(classify("no", { recommendation }), "reject");
    assert.equal(classify("cancel", { recommendation }), "reject");
    assert.equal(classify("stop", { recommendation }), "reject");
  }
});

test("unrelated conversation is not converted into execution", () => {
  assert.equal(classify("tell me why", { recommendation: true }), null);
  assert.equal(classify("what happened", { recommendation: false }), null);
});

test("natural compound confirmation executes only an already pending action", () => {
  for (const message of [
    "yes continue",
    "yes confirm",
    "yes confirm and continue",
    "yes, confirm and continue the exact action",
    "confirm and continue the exact action",
    "continue with the exact action",
  ]) {
    assert.equal(classify(message), "execute", `${message} should confirm the exact pending action`);
    assert.equal(classify(message, { pending: false }), null, `${message} must not create authority without a pending action`);
  }
});

test("compound confirmation remains fail closed when the user adds negation or discussion", () => {
  for (const message of [
    "yes but do not do it",
    "yes but stop",
    "yes confirm after you explain",
    "continue but do not execute",
  ]) {
    assert.equal(classify(message), null);
  }
});

