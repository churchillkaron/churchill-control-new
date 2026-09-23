import { randomUUID } from "node:crypto";
import { executeIntelligenceLocal, intelligenceLocalConfigured, shouldUseLocalIntelligence } from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js";
import { executeIntelligenceLocalQueueAndWait, intelligenceLocalQueueConfigured, shouldUseLocalIntelligenceQueue } from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js";
import { OrganizationServiceRuntime } from "../../platform/service-runtime/services/runtime/OrganizationServiceRuntime.js";
import { UsageRuntime } from "../../platform/service-runtime/usage/UsageRuntime.js";

export const OPERATOR_FRONT_COGNITION_CONTRACT = "AVANTIQO_OPERATOR_FRONT_COGNITION_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function findText(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

async function runFront({ organizationId, partyId, entityId, system, messages, operation, temperature, maxOutputTokens, metadata, frontTaskMode, expectJson }) {
  const promptMessages = [
    ...(text(system) ? [{ role: "system", content: text(system, 16000) }] : []),
    ...messages,
  ];
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "ai.text.generate",
  });
  if (!organizationService || String(organizationService.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("OPERATOR_FRONT_COGNITION_SERVICE_NOT_ACTIVE");
  }
  if (organizationService.usage_enabled === false) {
    throw new Error("OPERATOR_FRONT_COGNITION_USAGE_DISABLED");
  }
  const internalUsageId = `operator-front:${randomUUID()}`;
  const localQueueConfigured = intelligenceLocalQueueConfigured();
  const localFrontConfigured = intelligenceLocalConfigured();
  const ownedFrontConfigured = localQueueConfigured || localFrontConfigured;
  if (!ownedFrontConfigured) {
    throw new Error("OPERATOR_FRONT_COGNITION_LOCAL_RUNTIME_REQUIRED");
  }
  const startedAt = Date.now();
  const executionInput = {
    capability: "ai.text.generate",
    intelligence_product: "business_partner",
    execution_lane: "front",
    messages: promptMessages,
    front_task_mode: frontTaskMode || "semantic_classifier",
    temperature,
    max_output_tokens: maxOutputTokens,
    ...(expectJson ? { response_format: { type: "json_object" } } : {}),
    context: {
      organization_id: organizationId,
      organization_service_id: "operator-front-internal-cognition",
      usage_id: internalUsageId,
    },
    metadata: {
      module: "OPERATOR",
      operation,
      latency_class: "interactive",
      front_cognition_contract: OPERATOR_FRONT_COGNITION_CONTRACT,
      read_only: true,
      internal_platform_cognition: true,
      zero_price_owned_cpu_lane: true,
      ...metadata,
    },
  };
  let execution;
  if (shouldUseLocalIntelligenceQueue(executionInput)) {
    try {
      execution = await executeIntelligenceLocalQueueAndWait(executionInput, { timeout_ms: 20_000, poll_ms: 200 });
    } catch (error) {
      console.error("OPERATOR_FRONT_COGNITION_LOCAL_QUEUE_FAILED", { operation, error: text(error?.message || error, 500) });
      throw error;
    }
  }
  if (!execution && shouldUseLocalIntelligence(executionInput)) {
    try {
      execution = await executeIntelligenceLocal(executionInput);
    } catch (error) {
      if (String(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED || "").trim().toLowerCase() === "true") throw error;
      console.error("OPERATOR_FRONT_COGNITION_LOCAL_RUNTIME_FAILED", { operation, error: text(error?.message || error, 500) });
    }
  }
  if (!execution) {
    throw new Error("OPERATOR_FRONT_COGNITION_LOCAL_RUNTIME_UNAVAILABLE");
  }
  const rawOutput = execution?.output && typeof execution.output === "object" ? execution.output : {};
  if (execution?.provider !== "avantiqo-intelligence" || rawOutput.execution_lane !== "front") {
    throw new Error("OPERATOR_FRONT_COGNITION_OWNED_CPU_EVIDENCE_REQUIRED");
  }
  if (
    rawOutput.mutation_authority !== false ||
    rawOutput.tools_allowed !== false ||
    rawOutput.external_compute_started === true
  ) {
    throw new Error("OPERATOR_FRONT_COGNITION_CPU_READ_ONLY_BOUNDARY_REQUIRED");
  }
  const responseText = text(findText(execution), 12000);
  if (!responseText) throw new Error("OPERATOR_FRONT_COGNITION_EMPTY_RESPONSE");
  const providerLatencyMs = Math.max(0, Math.round(Number(rawOutput.generation_seconds || 0) * 1000));
  const usageRecord = await UsageRuntime.record({
    organization_id: organizationId,
    party_id: partyId || null,
    entity_id: entityId || null,
    organization_service_id: organizationService.id || null,
    category: "AI",
    provider: "avantiqo-intelligence",
    capability: "ai.text.generate",
    operation,
    quantity: 1,
    unit: "request",
    supplier_cost: 0,
    platform_markup: 0,
    customer_price: 0,
    currency: "THB",
    status: "SUCCESS",
    latency_ms: Date.now() - startedAt,
    provider_model: execution.model || rawOutput.model || null,
    provider_latency_ms: providerLatencyMs || null,
    metadata: {
      module: "OPERATOR",
      service_id: "ai.text.generate",
      execution_lane: "front",
      front_task_mode: frontTaskMode || "semantic_classifier",
      front_cognition_contract: OPERATOR_FRONT_COGNITION_CONTRACT,
      internal_platform_cognition: true,
      zero_price_owned_cpu_lane: true,
      wallet_reservation_required: false,
      billing_required: false,
      prompt_tokens: Number(rawOutput.prompt_tokens || rawOutput?.usage?.input_tokens || 0) || 0,
      completion_tokens: Number(rawOutput.completion_tokens || rawOutput?.usage?.output_tokens || 0) || 0,
      light_model: text(rawOutput.light_model, 240) || null,
      speculative_light_safe: rawOutput.safe_light_draft === true,
      semantic_generation_ms: Number(rawOutput.semantic_seconds || 0) > 0 ? Math.round(Number(rawOutput.semantic_seconds) * 1000) : null,
      light_generation_ms: Number(rawOutput.light_seconds || 0) > 0 ? Math.round(Number(rawOutput.light_seconds) * 1000) : null,
      ...metadata,
    },
  });
  return {
    success: true,
    text: responseText,
    provider: execution.provider,
    model: execution.model || rawOutput.model || null,
    usage_id: usageRecord?.id || internalUsageId,
    usage: usageRecord ? { id: usageRecord.id } : null,
    execution_lane: "front",
    escalated: false,
    internal_platform_cognition: true,
    governed_usage_recorded: true,
    zero_price_owned_cpu_lane: true,
    speculative_light_text: rawOutput.safe_light_draft === true ? text(rawOutput.light_text, 12000) || null : null,
    speculative_light_safe: rawOutput.safe_light_draft === true,
    speculative_light_model: text(rawOutput.light_model, 240) || null,
    front_metrics: {
      generation_seconds: Number(rawOutput.generation_seconds || 0) || null,
      semantic_seconds: Number(rawOutput.semantic_seconds || 0) || null,
      light_seconds: Number(rawOutput.light_seconds || 0) || null,
      startup_ready_seconds: Number(rawOutput.startup_ready_seconds || 0) || null,
      prompt_tokens: Number(rawOutput.prompt_tokens || rawOutput?.usage?.input_tokens || 0) || null,
      completion_tokens: Number(rawOutput.completion_tokens || rawOutput?.usage?.output_tokens || 0) || null,
    },
  };
}

async function runFastFallback({ organizationId, partyId, entityId, system, messages, operation, temperature, maxOutputTokens }) {
  const { AvantiqoIntelligenceReasoningRuntime } = await import("../../intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js");
  const execution = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    system,
    messages,
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "OPERATOR", operation: `${operation}_FAST_ESCALATION`, raw_reasoning_persisted: false, front_cognition_contract: OPERATOR_FRONT_COGNITION_CONTRACT },
    execution_lane: "fast",
    temperature,
    response_format: { type: "json_object" },
    max_output_tokens: maxOutputTokens,
    max_turns: 1,
    max_tool_calls: 0,
    settlement_deadline_ms: 12000,
    settlement_queue_grace_ms: 0,
  });
  return { ...execution, execution_lane: "fast", escalated: true };
}

export async function runOperatorFrontCognition({ organization_id, party_id = null, entity_id = null, system, messages = [], operation = "FRONT_COGNITION", temperature = 0.05, max_output_tokens = 220, metadata = {}, expect_json = false, front_task_mode = "semantic_classifier", allow_fast_escalation = false } = {}) {
  const organizationId = text(organization_id, 200);
  if (!organizationId) throw new Error("OPERATOR_FRONT_COGNITION_ORGANIZATION_REQUIRED");
  const request = { organizationId, partyId: party_id, entityId: entity_id, system, messages, operation, temperature, maxOutputTokens: max_output_tokens, metadata, frontTaskMode: text(front_task_mode, 80) || "semantic_classifier", expectJson: expect_json === true };
  const startedAt = Date.now();
  try {
    const front = await runFront(request);
    if (!expect_json) return front;
    try {
      JSON.parse(front.text);
      return front;
    } catch (error) {
      const compactSemanticEnvelope =
        request.frontTaskMode === "semantic_classifier" &&
        (/\bi\s*=\s*(?:chat|inspect|operate|followup|revise|artifact|unclear)\b/i.test(front.text) ||
          /\br\s*=\s*[ceg]\b/i.test(front.text));
      if (compactSemanticEnvelope) return front;
      if (!allow_fast_escalation) throw new Error("OPERATOR_FRONT_COGNITION_STRUCTURED_OUTPUT_INVALID");
      console.error("OPERATOR_FRONT_COGNITION_ESCALATING", { operation, phase: "INVALID_STRUCTURED_OUTPUT", elapsed_ms: Date.now() - startedAt, error: text(error?.message || error, 240), preview: text(front.text, 300) });
      return runFastFallback(request);
    }
  } catch (error) {
    if (!allow_fast_escalation) throw error;
    console.error("OPERATOR_FRONT_COGNITION_ESCALATING", { operation, phase: "FRONT_FAILED", elapsed_ms: Date.now() - startedAt, error: text(error?.message || error, 240) });
    return runFastFallback(request);
  }
}

export default runOperatorFrontCognition;
