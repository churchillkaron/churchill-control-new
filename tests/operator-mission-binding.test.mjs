import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMissionBindings,
  captureMissionBindingValue,
  applyMissionBindings,
  missionBindingValueKey,
} from "../lib/operator/runtime/OperatorMissionBindingRuntime.js";

function binding(overrides = {}) {
  return {
    source_step_id: "read_source",
    source: "result",
    source_path: "record.id",
    target_path: "customer_id",
    ...overrides,
  };
}

test("normalizes an explicit prior-step scalar binding", () => {
  const map = normalizeMissionBindings([
    { id: "read_source" },
    { id: "write_target", bindings: [binding()] },
  ]);
  const [normalized] = map.get("write_target");
  assert.equal(normalized.source_step_id, "read_source");
  assert.equal(normalized.target_path, "customer_id");
});

test("rejects protected scope, prototype and sensitive source paths", () => {
  assert.throws(
    () => normalizeMissionBindings([
      { id: "read_source" },
      { id: "write_target", bindings: [binding({ target_path: "organization_id" })] },
    ]),
    /PROTECTED_TARGET/,
  );
  assert.throws(
    () => normalizeMissionBindings([
      { id: "read_source" },
      { id: "write_target", bindings: [binding({ target_path: "metadata.__proto__.admin" })] },
    ]),
    /TARGET_PATH_INVALID/,
  );
  assert.throws(
    () => normalizeMissionBindings([
      { id: "read_source" },
      { id: "write_target", bindings: [binding({ source_path: "credentials.api_key" })] },
    ]),
    /SENSITIVE_SOURCE_BLOCKED/,
  );
});

test("captures read results and applies only declared scalar values", () => {
  const map = normalizeMissionBindings([
    { id: "read_source" },
    { id: "write_target", bindings: [binding()] },
  ]);
  const [normalized] = map.get("write_target");
  const captured = captureMissionBindingValue({
    binding: normalized,
    sourceStepMode: "read",
    result: { record: { id: "cus_123" } },
  });
  const key = missionBindingValueKey(normalized);
  const payload = applyMissionBindings({
    payload: { amount: 10 },
    bindings: [normalized],
    values: { [key]: captured.value },
  });
  assert.deepEqual(payload, { amount: 10, customer_id: "cus_123" });
});

test("mutating-step raw results cannot become binding authority", () => {
  const map = normalizeMissionBindings([
    { id: "read_source" },
    { id: "write_target", bindings: [binding()] },
  ]);
  const [normalized] = map.get("write_target");
  assert.throws(
    () => captureMissionBindingValue({
      binding: normalized,
      sourceStepMode: "write",
      result: { record: { id: "unsafe" } },
    }),
    /WRITE_REQUIRES_VERIFICATION_SOURCE/,
  );
});

test("mutating-step verification may export a declared scalar", () => {
  const map = normalizeMissionBindings([
    { id: "write_source" },
    {
      id: "write_target",
      bindings: [binding({
        source_step_id: "write_source",
        source: "verification",
        source_path: "record.id",
      })],
    },
  ]);
  const [normalized] = map.get("write_target");
  const captured = captureMissionBindingValue({
    binding: normalized,
    sourceStepMode: "write",
    verification: { record: { id: "verified_123" } },
  });
  assert.equal(captured.value, "verified_123");
});
