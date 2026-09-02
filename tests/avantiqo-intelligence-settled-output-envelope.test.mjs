import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveIntelligenceSettledOutputEnvelope,
} from "../lib/intelligence/runtime/AvantiqoIntelligenceOutputEnvelopeRuntime.mjs";

test("decodes canonical first Service Runtime settlement envelope", () => {
  const execution = {
    success: true,
    pending: false,
    settlement: "CHARGED",
    output: {
      url: null,
      provider_job_id: "modal-intelligence-direct:test",
      status: "completed",
      raw: {
        status: "completed",
        provider_job_id: "modal-intelligence-direct:test",
        output: {
          status: "completed",
          provider: "avantiqo-intelligence",
          execution_lane: "deep",
          text: "A settled Deep response.",
          finish_reason: "stop",
          tool_calls: [],
        },
        usage: {
          input_tokens: 100,
          output_tokens: 20,
        },
      },
    },
  };

  const output = resolveIntelligenceSettledOutputEnvelope(execution);
  assert.equal(output.text, "A settled Deep response.");
  assert.equal(output.finish_reason, "stop");
  assert.deepEqual(output.tool_calls, []);
});

test("decodes direct completed provider output without changing it", () => {
  const execution = {
    output: {
      status: "completed",
      text: "Direct response.",
      finish_reason: "stop",
      tool_calls: [],
    },
  };

  const output = resolveIntelligenceSettledOutputEnvelope(execution);
  assert.equal(output.text, "Direct response.");
});

test("decodes settled tool calls through output.raw.output", () => {
  const execution = {
    output: {
      raw: {
        output: {
          status: "completed",
          text: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "test.read",
                arguments: "{}",
              },
            },
          ],
        },
      },
    },
  };

  const output = resolveIntelligenceSettledOutputEnvelope(execution);
  assert.equal(output.tool_calls.length, 1);
  assert.equal(output.tool_calls[0].function.name, "test.read");
});
