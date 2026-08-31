import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_FAST_WARM_SESSION_LATENCY_PROOF_V1";
const MAX_INTERACTIVE_LATENCY_MS = 5_000;
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const text = (value) => String(value ?? "").trim();
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

if (!yes(process.env.AVANTIQO_FAST_WARM_SESSION_PROOF_SPEND_APPROVED)) {
  throw new Error(`${CONTRACT}_SPEND_APPROVAL_REQUIRED`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_SAFE_LEASE_REQUIRED`);
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "intelligence-fast") {
  throw new Error(`${CONTRACT}_FAST_SAFE_LEASE_REQUIRED`);
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { AvantiqoIntelligenceProvider } = await import(
  "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider"
);

async function runCall({ label, expected, requestTimeoutMs, maxOutputTokens = 16 }) {
  const startedAt = performance.now();
  const result = await AvantiqoIntelligenceProvider.execute({
    capability: "ai.text.generate",
    execution_lane: "fast",
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are Avantiqo Fast. Follow the user's exact concise response instruction.",
      },
      { role: "user", content: `Reply exactly ${expected} and nothing else.` },
    ],
    temperature: 0,
    max_output_tokens: maxOutputTokens,
    request_timeout_ms: requestTimeoutMs,
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const output = result?.output?.text ?? result?.output?.output?.text ?? result?.text ?? "";
  if (!text(output).includes(expected)) {
    throw new Error(`${CONTRACT}_${label}_RESPONSE_INVALID:${text(output).slice(0, 120)}`);
  }
  return { label, latency_ms: latencyMs, output_verified: true };
}

// This first call intentionally pays the cold-start cost. In the product this
// happens when the authenticated Business Partner session becomes active,
// before the customer submits their first conversational turn.
const warmup = await runCall({
  label: "WARMUP",
  expected: "WARM_OK",
  requestTimeoutMs: 180_000,
  maxOutputTokens: 8,
});

const turn1 = await runCall({
  label: "TURN_1",
  expected: "FAST_ONE",
  requestTimeoutMs: 10_000,
  maxOutputTokens: 8,
});
const turn2 = await runCall({
  label: "TURN_2",
  expected: "FAST_TWO",
  requestTimeoutMs: 10_000,
  maxOutputTokens: 8,
});

for (const turn of [turn1, turn2]) {
  if (turn.latency_ms > MAX_INTERACTIVE_LATENCY_MS) {
    throw new Error(
      `${CONTRACT}_${turn.label}_LATENCY_GATE_FAILED:${turn.latency_ms}:${MAX_INTERACTIVE_LATENCY_MS}`,
    );
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  model: MODEL,
  execution_lane: "fast",
  transport: "RUNPOD_SERVERLESS_WARM_SESSION",
  cold_warmup_latency_ms: warmup.latency_ms,
  interactive_latency_gate_ms: MAX_INTERACTIVE_LATENCY_MS,
  measured_turns: [turn1, turn2],
  external_ai_fallback_used: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
