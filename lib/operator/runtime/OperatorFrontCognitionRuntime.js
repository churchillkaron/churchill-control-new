import { ServiceExecutionRuntime } from "../../platform/service-runtime/execution/ServiceExecutionRuntime.js";
import {
  ownedOperatorIntelligenceSelectionPolicy,
  settleOperatorIntelligenceExecution,
} from "./OperatorOwnedIntelligenceServiceRuntime.js";

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
  let execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    ...ownedOperatorIntelligenceSelectionPolicy(),
    input: { messages: promptMessages, execution_lane: "front", front_task_mode: frontTaskMode || "semantic_classifier", temperature, max_output_tokens: maxOutputTokens, ...(expectJson ? { response_format: { type: "json_object" } } : {}) },
    metadata: { module: "OPERATOR", operation, latency_class: "interactive", front_cognition_contract: OPERATOR_FRONT_COGNITION_CONTRACT, read_only: true, ...metadata },
    category: "AI",
  });
  execution = await settleOperatorIntelligenceExecution({
    organization_id: organizationId,
    execution,
    service_id: "ai.text.generate",
    execution_lane: "front",
    poll_interval_ms: 250,
    max_polls: 48,
    metadata: { module: "OPERATOR", operation: `${operation}_SETTLEMENT`, front_cognition_contract: OPERATOR_FRONT_COGNITION_CONTRACT, raw_reasoning_persisted: false },
  });
  const responseText = text(findText(execution), 12000);
  if (!responseText) throw new Error("OPERATOR_FRONT_COGNITION_EMPTY_RESPONSE");
  return { success: true, text: responseText, provider: execution?.provider || null, model: execution?.model || null, usage_id: execution?.usage?.id || null, execution_lane: "front", escalated: false };
}

async function runFastFallback({ organizationId, partyId, entityId, system, messages, operation, temperature, maxOutputTokens }) {
  const { AvantiqoIntelligenceReasoningRuntime } = await import("@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime");
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

export async function runOperatorFrontCognition({ organization_id, party_id = null, entity_id = null, system, messages = [], operation = "FRONT_COGNITION", temperature = 0.05, max_output_tokens = 220, metadata = {}, expect_json = false, front_task_mode = "semantic_classifier" } = {}) {
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
      if (/\br\s*=\s*[ceg]\b/i.test(front.text)) return front;
      console.error("OPERATOR_FRONT_COGNITION_ESCALATING", { operation, phase: "INVALID_STRUCTURED_OUTPUT", elapsed_ms: Date.now() - startedAt, error: text(error?.message || error, 240), preview: text(front.text, 300) });
      return runFastFallback(request);
    }
  } catch (error) {
    console.error("OPERATOR_FRONT_COGNITION_ESCALATING", { operation, phase: "FRONT_FAILED", elapsed_ms: Date.now() - startedAt, error: text(error?.message || error, 240) });
    return runFastFallback(request);
  }
}

export default runOperatorFrontCognition;
