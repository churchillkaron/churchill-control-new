import test from "node:test";
import assert from "node:assert/strict";
import { fastCurrentStateEvidenceRequired } from "../lib/operator/runtime/OperatorReasoningRuntime.js";

const read = (overrides = {}) => ({
  key: "platform.organizational_context.read",
  mode: "read",
  domain: "platform",
  capability: "organizational_context",
  action: "read",
  name: "Organizational Context",
  description: "Read organization identity, company context, legal entity context, and verified operating context.",
  operator_aliases: ["organization context", "business context", "company context"],
  ...overrides,
});

test("current organization and legal-entity question requires registered live evidence", () => {
  assert.equal(fastCurrentStateEvidenceRequired({
    user_input: { message: "What is the current organization and legal entity context, and what can you verify live right now?" },
    executable_capabilities: [read()],
  }), true);
});

test("ordinary strategic conversation does not gain a synthetic live-read obligation", () => {
  assert.equal(fastCurrentStateEvidenceRequired({
    user_input: { message: "What do you think is the best way to explain our company?" },
    executable_capabilities: [read()],
  }), false);
});

test("current wording alone does not require a read when no materially matching read exists", () => {
  assert.equal(fastCurrentStateEvidenceRequired({
    user_input: { message: "What is the current weather outside?" },
    executable_capabilities: [read()],
  }), false);
});
