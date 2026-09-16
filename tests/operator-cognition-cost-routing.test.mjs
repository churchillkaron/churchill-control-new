import test from "node:test";
import assert from "node:assert/strict";
import { routeOperatorCognition } from "../lib/operator/runtime/OperatorCognitionRouter.js";

const capability = (key, aliases = []) => {
  const [domain, name, action] = key.split(".");
  return {
    key, domain, capability: name, action,
    mode: action === "read" ? "read" : "write",
    operator_aliases: aliases,
    description: key,
    input_schema: { type: "object", properties: {} },
  };
};

test("clear create command stays on Fast even with weaker nearby actions", () => {
  const result = routeOperatorCognition({
    message: "create customer invoice",
    capabilities: [
      capability("finance.customer_invoices.create", ["create customer invoice"]),
      capability("finance.customers.create", ["create customer"]),
      capability("finance.vendor_bills.create", ["create vendor bill"]),
    ],
  });
  assert.equal(result.path, "fast");
  assert.match(result.reason, /REGISTERED_ACTION/);
});

test("clear add staff command stays on Fast", () => {
  const result = routeOperatorCognition({
    message: "add employee",
    capabilities: [
      capability("people.employees.create", ["add employee", "add staff"]),
      capability("projects.projects.create", ["create project"]),
    ],
  });
  assert.equal(result.path, "fast");
});

test("genuinely ambiguous multi-action request still escalates to Deep", () => {
  const result = routeOperatorCognition({
    message: "create customer and create supplier",
    capabilities: [
      capability("commercial.customers.create", ["create customer"]),
      capability("supply-chain.suppliers.create", ["create supplier"]),
    ],
  });
  assert.equal(result.path, "deep");
});

test("short collaborative strategy stays Fast even when a capability matches", () => {
  const result = routeOperatorCognition({
    message: "what should we do about invoices",
    capabilities: [capability("finance.customer_invoices.create", ["create invoice"])],
  });
  assert.equal(result.path, "fast");
  assert.equal(result.reason, "FAST_COLLABORATIVE_PARTNER_TURN");
});

test("creative video discussion stays Fast and imaginative", () => {
  for (const message of [
    "what if we make the reveal slower and more mysterious?",
    "give me three better ideas for the opening",
    "what do you think about making this more cinematic?",
  ]) {
    const result = routeOperatorCognition({ message, capabilities: [] });
    assert.equal(result.path, "fast", message);
  }
});


test("long strategic discussion stays on owned local cognition by default", () => {
  const message = "We need to rethink how the Business Partner should handle a long strategic discussion about invoices, cash flow, customer follow-up, staffing pressure, and what we should prioritize next. Compare the tradeoffs and explain what you think we should do, but there is no production change, payment, approval, deletion, or other irreversible action in this request.";
  const result = routeOperatorCognition({ message, capabilities: [] });
  assert.equal(result.path, "fast");
});

test("short analytical follow-up stays local instead of buying Deep", () => {
  const result = routeOperatorCognition({ message: "why is that the better option?", capabilities: [] });
  assert.equal(result.path, "fast");
  assert.equal(result.reason, "FAST_LOCAL_DELIBERATION");
});

test("explicit deep investigation still uses Deep", () => {
  const result = routeOperatorCognition({
    message: "do a deep analysis and root cause investigation of why the render pipeline fails",
    capabilities: [],
  });
  assert.equal(result.path, "deep");
});


test("Fast partner instructions explicitly preserve imagination and project continuity", async () => {
  const fs = await import("node:fs");
  const reasoning = fs.readFileSync(new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url), "utf8");
  const conversation = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");
  assert.match(reasoning, /act like a strong creative partner rather than a command parser/i);
  assert.match(reasoning, /propose original alternatives/i);
  assert.match(reasoning, /2 to 4 genuinely different options/i);
  assert.match(conversation, /imaginative creative partner/i);
  assert.match(conversation, /project_context and recent_conversation/i);
});
