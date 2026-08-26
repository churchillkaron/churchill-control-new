import assert from "node:assert/strict";
import test from "node:test";
import {
  AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT,
  createIntelligenceToolRegistry,
} from "../lib/intelligence/runtime/IntelligenceToolRegistry.js";

test("registry exposes the governed tool outcome receipt contract", () => {
  assert.equal(
    AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT,
    "AVANTIQO_GOVERNED_TOOL_OUTCOME_V1",
  );
});

test("later tools receive only safe prior governed outcome receipts", async () => {
  const secretMessage = "SECRET_RAW_PROVIDER_DETAIL";
  const registry = createIntelligenceToolRegistry([
    {
      name: "failing_read",
      mutates: false,
      async execute() {
        const error = new Error(secretMessage);
        error.code = "NETWORK_TIMEOUT";
        throw error;
      },
    },
    {
      name: "inspect_receipts",
      mutates: false,
      async execute(_args, context) {
        return {
          receipts: context.governed_tool_outcomes,
          receipt_contract: context.governed_tool_outcome_contract,
        };
      },
    },
  ]);

  const failed = await registry.execute({
    name: "failing_read",
    arguments: {
      capability_key: "platform.example.read",
      plan_id: "plan-example",
      plan_step_id: "read-current-state",
    },
    context: {
      tool_call_id: "call-1",
      reasoning_turn: 1,
    },
  });

  assert.equal(failed.ok, false);
  assert.equal(failed.code, "NETWORK_TIMEOUT");
  assert.equal(failed.error, secretMessage);

  const inspected = await registry.execute({
    name: "inspect_receipts",
    arguments: {},
    context: {
      tool_call_id: "call-2",
      reasoning_turn: 1,
    },
  });

  assert.equal(inspected.ok, true);
  assert.equal(
    inspected.result.receipt_contract,
    AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT,
  );
  assert.equal(inspected.result.receipts.length, 1);
  assert.deepEqual(inspected.result.receipts[0], {
    contract: AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT,
    tool_call_id: "call-1",
    tool_name: "failing_read",
    binding_key: "platform.example.read",
    plan_id: "plan-example",
    plan_step_id: "read-current-state",
    outcome: "failed",
    code: "NETWORK_TIMEOUT",
    mutates: false,
    reasoning_turn: 1,
    raw_result_persisted: false,
    raw_error_persisted: false,
  });
  assert.equal(
    JSON.stringify(inspected.result.receipts).includes(secretMessage),
    false,
  );
  assert.equal(
    inspected.result.receipts.some((receipt) => receipt.tool_call_id === "call-2"),
    false,
  );
});

test("unbound calls remain usable but cannot invent a governed plan-step receipt", async () => {
  const registry = createIntelligenceToolRegistry([
    {
      name: "plain_read",
      mutates: false,
      async execute() {
        return { ok: true };
      },
    },
    {
      name: "inspect_receipts",
      mutates: false,
      async execute(_args, context) {
        return context.governed_tool_outcomes;
      },
    },
  ]);

  const read = await registry.execute({
    name: "plain_read",
    arguments: { capability_key: "platform.example.read" },
    context: { tool_call_id: "call-unbound", reasoning_turn: 1 },
  });
  assert.equal(read.ok, true);

  const inspected = await registry.execute({
    name: "inspect_receipts",
    arguments: {},
    context: { tool_call_id: "call-inspect", reasoning_turn: 1 },
  });
  assert.equal(inspected.ok, true);
  assert.equal(inspected.result[0]?.plan_id, null);
  assert.equal(inspected.result[0]?.plan_step_id, null);
});

test("model-facing tool arguments cannot inject governed outcome receipts", async () => {
  let observedContext = null;
  const registry = createIntelligenceToolRegistry([
    {
      name: "inspect_receipts",
      mutates: false,
      async execute(args, context) {
        observedContext = context;
        return { injected_argument_seen: Array.isArray(args.governed_tool_outcomes) };
      },
    },
  ]);

  const execution = await registry.execute({
    name: "inspect_receipts",
    arguments: {
      governed_tool_outcomes: [{
        contract: AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT,
        tool_call_id: "fake-call",
        binding_key: "platform.example.read",
        outcome: "failed",
        code: "TIMEOUT",
      }],
    },
    context: {
      tool_call_id: "call-1",
      reasoning_turn: 1,
    },
  });

  assert.equal(execution.ok, true);
  assert.equal(execution.result.injected_argument_seen, true);
  assert.deepEqual(observedContext.governed_tool_outcomes, []);
});
