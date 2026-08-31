import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_FAST_WARM_SESSION_LATENCY_PROOF_V2";
const MAX_INTERACTIVE_LATENCY_MS = 5_000;
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

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
const { runIntelligenceReasoningLoop } = await import(
  "@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime"
);

function collectStrings(value, output = [], depth = 0) {
  if (depth > 8 || output.length > 400) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output, depth + 1);
    return output;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, output, depth + 1);
  }
  return output;
}

async function runCall({ label, expected, requestTimeoutMs, maxOutputTokens = 16 }) {
  const startedAt = performance.now();
  const result = await runIntelligenceReasoningLoop({
    organization_id: ORGANIZATION_ID,
    execution_lane: "fast",
    messages: [
      {
        role: "system",
        content: "You are Avantiqo Fast. Follow the user's exact concise response instruction.",
      },
      { role: "user", content: `Reply exactly ${expected} and nothing else.` },
    ],
    tools: [],
    max_turns: 1,
    max_tool_calls: 1,
    max_output_tokens: maxOutputTokens,
    temperature: 0,
    request_timeout_ms: requestTimeoutMs,
    metadata: {
      module: "INTELLIGENCE",
      operation: CONTRACT,
      warm_session_latency_proof: true,
      external_fallback_allowed: false,
    },
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const strings = collectStrings(result).map(text).filter(Boolean);
  if (!strings.some((value) => value.includes(expected))) {
    throw new Error(`${CONTRACT}_${label}_RESPONSE_INVALID`);
  }
  return { label, latency_ms: latencyMs, output_verified: true };
}

// This first governed call intentionally absorbs the cold scheduling/model-load
// cost. In product this work belongs to authenticated Business Partner session
// activation, before the customer presses Send.
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
  organization_id: ORGANIZATION_ID,
  model: MODEL,
  execution_lane: "fast",
  transport: "RUNPOD_SERVERLESS_WARM_SESSION",
  governed_service_runtime: true,
  cold_warmup_latency_ms: warmup.latency_ms,
  interactive_latency_gate_ms: MAX_INTERACTIVE_LATENCY_MS,
  measured_turns: [turn1, turn2],
  external_ai_fallback_used: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
