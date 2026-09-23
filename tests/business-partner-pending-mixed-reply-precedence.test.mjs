import assert from "node:assert/strict";
import test from "node:test";
import { classifyPendingOperatorReply } from "../lib/operator/runtime/OperatorHumanDecisionClassifier.js";

test("plain affirmative compound execution still uses exact pending action fast path", () => {
  assert.equal(classifyPendingOperatorReply({ message: "yes, create it now", pending: true }), "execute");
});

test("affirmative plus correction never bypasses semantic revision", () => {
  for (const message of [
    "yes, but change the date and create it",
    "okay create it instead with the updated date",
    "sure, modify the amount then issue it",
    "yes please correct the customer and create it",
  ]) {
    assert.equal(classifyPendingOperatorReply({ message, pending: true }), null, message);
  }
});
