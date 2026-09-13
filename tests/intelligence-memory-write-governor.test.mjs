import assert from "node:assert/strict";
import test from "node:test";
import { memoryWriteAdmission } from "../lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js";

test("durable human decisions remain durable", () => {
  const result = memoryWriteAdmission({
    type: "decision",
    content: "Keep production changes behind explicit owner approval",
    importance: 0.95,
    metadata: { authorization_value: "none" },
  });
  assert.equal(result.admit, true);
  assert.equal(result.ttlDays, null);
});

test("live mutable business state is not persisted as durable memory", () => {
  const result = memoryWriteAdmission({
    type: "fact",
    content: "Current account balance is a live value",
    importance: 0.95,
    metadata: { mutable_business_fact_requires_live_read: true },
  });
  assert.equal(result.admit, false);
  assert.equal(result.reason, "LIVE_BUSINESS_STATE_REQUIRES_LIVE_READ");
});

test("completed steps are retained only as bounded episodic memory", () => {
  const result = memoryWriteAdmission({
    type: "completed_step",
    content: "Invoice workflow verification completed",
    importance: 0.74,
    metadata: { authorization_value: "none" },
  });
  assert.equal(result.admit, true);
  assert.equal(result.ttlDays, 90);
});

test("low-value transient noise is rejected", () => {
  const result = memoryWriteAdmission({
    type: "completed_step",
    content: "Minor transient progress event",
    importance: 0.2,
    metadata: { authorization_value: "none" },
  });
  assert.equal(result.admit, false);
});
