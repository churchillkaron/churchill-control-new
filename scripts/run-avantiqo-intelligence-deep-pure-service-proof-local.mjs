import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_PURE_SERVICE_PROOF_V1";
const MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const EXPECTED_CALLS = 3;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function requirePinnedHead() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_DEEP_PURE_PROOF_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  }
  const actual = text(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }), 160).toLowerCase();
  if (actual !== expected) {
    throw new Error(`${CONTRACT}_PINNED_HEAD_MISMATCH:${actual}:${expected}`);
  }
  return actual;
}

function requireDeepSafeLease() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_DEEP_PURE_PROOF_SPEND_APPROVED)) {
    throw new Error(`${CONTRACT}_SPEND_APPROVAL_REQUIRED`);
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== "AVANTIQO_RUNPOD_SAFE_LEASE_V2") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== "intelligence-deep") {
    throw new Error(`${CONTRACT}_DEEP_LANE_REQUIRED`);
  }
  if (!text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 240)) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_REQUIRED`);
  }
}

const head = requirePinnedHead();
requireDeepSafeLease();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { AvantiqoIntelligenceReasoningRuntime } = await import(
  "@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime"
);

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", "Avantiqo Platform")
  .eq("organization_type", "enterprise_group")
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);
if (organizationResult.error) throw organizationResult.error;
const organizations = Array.isArray(organizationResult.data) ? organizationResult.data : [];
if (organizations.length !== 1 || !organizations[0]?.id) {
  throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${organizations.length}`);
}
const organizationId = String(organizations[0].id);

const prompts = [
  "Analyze this bounded proposition: a production AI lane should fail closed rather than use an unauthorized external provider. Return a concise decision with one reason.",
  "Analyze this bounded proposition: a prepaid service must not charge a customer when provider execution fails before producing a usable result. Return a concise decision with one reason.",
  "Analyze this bounded proposition: an owned GPU lease must return to its configured resting state after the request completes. Return a concise decision with one reason.",
];

const results = [];
for (let index = 0; index < prompts.length; index += 1) {
  const result = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    system: [
      "You are Avantiqo owned Deep Intelligence in a bounded production-service certification probe.",
      "Do not use tools. Do not execute actions. Do not call external AI. Return only the requested concise decision.",
    ].join("\n"),
    messages: [{ role: "user", content: prompts[index] }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "INTELLIGENCE",
      operation: "DEEP_PURE_SERVICE_CERTIFICATION",
      repository_head: head,
      production_service_certification: true,
      pure_deep_certification: true,
      certification_pass: index + 1,
      external_fallback_allowed: false,
      raw_reasoning_persisted: false,
    },
    execution_lane: "deep",
    temperature: 0.1,
    max_output_tokens: 2048,
    max_turns: 1,
    max_tool_calls: 1,
  });

  if (result?.success !== true) throw new Error(`${CONTRACT}_CALL_${index + 1}_NOT_SUCCESS`);
  if (result?.provider !== "avantiqo-intelligence") throw new Error(`${CONTRACT}_CALL_${index + 1}_PROVIDER_INVALID`);
  if (result?.model !== MODEL) throw new Error(`${CONTRACT}_CALL_${index + 1}_MODEL_INVALID:${text(result?.model, 300)}`);
  if (result?.execution_lane !== "deep") throw new Error(`${CONTRACT}_CALL_${index + 1}_LANE_INVALID`);
  if (result?.capability !== "ai.reasoning.execute") throw new Error(`${CONTRACT}_CALL_${index + 1}_CAPABILITY_INVALID`);
  if (!text(result?.text, 12000)) throw new Error(`${CONTRACT}_CALL_${index + 1}_EMPTY`);
  results.push({
    pass: index + 1,
    provider: result.provider,
    model: result.model,
    execution_lane: result.execution_lane,
    capability: result.capability,
    finish_reason: result.finish_reason || null,
    input_tokens: Number(result?.usage?.input_tokens || 0),
    output_tokens: Number(result?.usage?.output_tokens || 0),
  });
}

if (results.length !== EXPECTED_CALLS) {
  throw new Error(`${CONTRACT}_CALL_COUNT_INVALID:${results.length}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_head: head,
  expected_calls: EXPECTED_CALLS,
  completed_calls: results.length,
  provider: "avantiqo-intelligence",
  model: MODEL,
  execution_lane: "deep",
  capability: "ai.reasoning.execute",
  calls: results,
  external_fallback_allowed: false,
  mutation_performed: false,
  production_activation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
