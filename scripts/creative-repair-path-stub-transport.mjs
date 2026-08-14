// Scripted stand-in for the reasoning transport, used only by the repair-path test.
//
// Responses are queued by the test and returned in order, so a test can say "the
// director returns this, then the repair returns that" and assert on what the
// runtime does with it. No provider is contacted and nothing is billed.

const queue = [];
const calls = [];

export function queueResponse(response) {
  queue.push(response);
}

export function recordedCalls() {
  return calls;
}

export function resetTransport() {
  queue.length = 0;
  calls.length = 0;
}

export const ServiceExecutionRuntime = Object.freeze({
  async execute(request = {}) {
    calls.push({
      service_id: request.service_id,
      operation: request.metadata?.operation || null,
      contract_repair_attempt: request.metadata?.contract_repair_attempt ?? null,
      prompt: request.input?.prompt || "",
    });

    if (!queue.length) {
      throw new Error(
        `STUB_TRANSPORT_EXHAUSTED:${request.metadata?.operation || request.service_id}`,
      );
    }

    const next = queue.shift();
    const body = typeof next === "string" ? next : JSON.stringify(next);

    return {
      output: { text: body },
      provider: "stub",
      model: "stub-model",
      usage: { calls: 1 },
      billing: { currency: "THB", amount: 0 },
    };
  },
});

export default ServiceExecutionRuntime;
