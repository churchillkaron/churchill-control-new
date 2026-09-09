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


test("explicit current organization and legal-entity context routes directly to registered organizational context read", () => {
  const capability = {
    key: "platform.organizational_context.read",
    mode: "read",
    risk: "low",
    auto_execute: true,
    requires_confirmation: false,
    input_schema: { type: "object", properties: { focus: { type: "string" } }, additionalProperties: false },
  };
  const result = resolveOperatorBusinessDataReflex({
    message: "What is the current organization and legal entity context, and what can you verify live right now? Read only.",
    capabilities: [capability],
    entityId: "entity-1",
  });
  assert.equal(result?.matched, true);
  assert.equal(result?.execute, true);
  assert.equal(result?.capability_key, "platform.organizational_context.read");
  assert.match(result?.payload?.focus || "", /current organization and legal entity context/i);
  assert.equal(result?.provider_evidence?.provider, "avantiqo-local");
});

test("generic current wording does not hijack organizational context read", () => {
  const capability = {
    key: "platform.organizational_context.read",
    mode: "read",
    risk: "low",
    auto_execute: true,
    requires_confirmation: false,
    input_schema: { type: "object", properties: { focus: { type: "string" } }, additionalProperties: false },
  };
  const result = resolveOperatorBusinessDataReflex({
    message: "What is the current weather outside?",
    capabilities: [capability],
    entityId: "entity-1",
  });
  assert.equal(result, null);
});


test("legal entity used only as domain scope does not hijack another registered read", () => {
  const organizationalContext = {
    key: "platform.organizational_context.read",
    mode: "read",
    risk: "low",
    auto_execute: true,
    requires_confirmation: false,
    input_schema: { type: "object", properties: { focus: { type: "string" } }, additionalProperties: false },
  };
  const invoiceRead = {
    key: "finance.customer_invoices.read",
    mode: "read",
    risk: "low",
    auto_execute: true,
    requires_confirmation: false,
    description: "Read Customer Invoices in finance Order to Cash.",
    input_schema: { type: "object", properties: {}, additionalProperties: true },
  };
  const result = resolveOperatorBusinessDataReflex({
    message: "Show me the current customer invoices for this legal entity. Read only.",
    capabilities: [organizationalContext, invoiceRead],
    entityId: "entity-1",
  });
  assert.notEqual(result?.capability_key, "platform.organizational_context.read");
});

test("explicit registered business object read routes without Intelligence", () => {
  const capabilities = [
    {
      key: "finance.customer_invoices.read",
      domain: "finance",
      capability: "customer_invoices",
      action: "read",
      mode: "read",
      context_scope: "entity",
      auto_execute: true,
      requires_confirmation: false,
      input_schema: { type: "object", properties: {}, additionalProperties: true },
    },
    {
      key: "finance.customer_payments.read",
      domain: "finance",
      capability: "customer_payments",
      action: "read",
      mode: "read",
      context_scope: "entity",
      auto_execute: true,
      requires_confirmation: false,
      input_schema: { type: "object", properties: {}, additionalProperties: true },
    },
  ];
  const result = resolveOperatorBusinessDataReflex({
    message: "Show me the current customer invoices for this legal entity. Read only.",
    capabilities,
    entityId: "entity-1",
  });
  assert.equal(result?.capability_key, "finance.customer_invoices.read");
  assert.equal(result?.execute, true);
  assert.equal(result?.provider_evidence?.provider, "avantiqo-local");
});
