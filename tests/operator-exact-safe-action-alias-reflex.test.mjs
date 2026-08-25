import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveOperatorBusinessDataReflex,
} from "../lib/operator/runtime/OperatorBusinessDataReflex.js";

function capability(overrides = {}) {
  return {
    key: "platform.product_engineering_cycle.execute",
    mode: "write",
    auto_execute: true,
    requires_confirmation: false,
    transactional: false,
    approval: null,
    risk: "low",
    context_scope: "organization",
    input_schema: {
      type: "object",
      properties: {
        focus: { type: "string" },
      },
      additionalProperties: false,
    },
    operator_aliases: ["continue building avantiqo"],
    ...overrides,
  };
}

test("exact low-risk auto-executable alias resolves locally without a model", () => {
  const result = resolveOperatorBusinessDataReflex({
    message: "Continue building Avantiqo",
    capabilities: [capability()],
  });

  assert.equal(result?.matched, true);
  assert.equal(result?.execute, true);
  assert.equal(result?.capability_key, "platform.product_engineering_cycle.execute");
  assert.equal(result?.provider_evidence?.provider, "avantiqo-local");
  assert.equal(result?.provider_evidence?.model, "registry-action-alias-reflex-v1");
  assert.deepEqual(result?.payload, {});
});

test("alias reflex fails closed for governed or ambiguous actions", () => {
  for (const guarded of [
    capability({ requires_confirmation: true }),
    capability({ transactional: true }),
    capability({ approval: { policy: "required" } }),
    capability({ risk: "high" }),
    capability({ auto_execute: false }),
    capability({ input_schema: { type: "object", required: ["focus"] } }),
  ]) {
    const result = resolveOperatorBusinessDataReflex({
      message: "Continue building Avantiqo",
      capabilities: [guarded],
    });
    assert.equal(result, null);
  }

  const ambiguous = resolveOperatorBusinessDataReflex({
    message: "Continue building Avantiqo",
    capabilities: [
      capability(),
      capability({ key: "platform.other.execute" }),
    ],
  });
  assert.equal(ambiguous, null);
});

test("alias reflex requires exact phrase rather than fuzzy or extended intent", () => {
  for (const message of [
    "continue building avantiqo now",
    "please continue building avantiqo",
    "continue avantiqo and deploy production",
  ]) {
    const result = resolveOperatorBusinessDataReflex({
      message,
      capabilities: [capability()],
    });
    assert.equal(result, null);
  }
});
