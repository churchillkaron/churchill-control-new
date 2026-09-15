import { runOperatorFrontCognition } from "./OperatorFrontCognitionRuntime.js";

export const OPERATOR_PENDING_ACTION_SEMANTIC_CONTRACT = "AVANTIQO_OPERATOR_PENDING_ACTION_SEMANTIC_V1";

function text(value, limit = 6000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }

function compactPayload(value, depth = 0) {
  if (depth > 3) return null;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compactPayload(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? text(value, 500) : value ?? null;
  const hidden = /token|secret|password|cookie|authorization|credential/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !hidden.test(key)).slice(0, 24).map(([key, item]) => [key, compactPayload(item, depth + 1)]));
}

function semanticBoolean(value) {
  const normalized = text(value, 20).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["1", "true", "yes"].includes(normalized);
}

function normalizeResult(value) {
  const source = object(value);
  const hasIndependentFields = ["x", "r", "c", "n"].some((key) => Object.prototype.hasOwnProperty.call(source, key));
  let relation = text(source.q ?? source.relation, 40).toLowerCase().replace(/[^a-z_]/g, "");
  if (hasIndependentFields) {
    const execute = semanticBoolean(source.x);
    const revise = semanticBoolean(source.r);
    const cancel = semanticBoolean(source.c);
    const newGoal = semanticBoolean(source.n);
    relation = newGoal ? "new_goal" : revise ? "revise" : cancel ? "cancel" : execute ? "confirm" : "discuss";
  }
  if (!["confirm", "cancel", "revise", "discuss", "new_goal", "unclear"].includes(relation)) return null;
  const presentation = text(source.p ?? source.result_presentation, 40).toLowerCase().replace(/[^a-z_]/g, "");
  const supplementalRaw = text(source.supplemental_request, 1200);
  const supplementalRequest = supplementalRaw && !["false", "null", "none", "n/a"].includes(supplementalRaw.toLowerCase()) ? supplementalRaw : null;
  return {
    contract: OPERATOR_PENDING_ACTION_SEMANTIC_CONTRACT,
    relation,
    confidence: Math.max(0, Math.min(1, Number.isFinite(Number(source.confidence)) && Number(source.confidence) > 0 ? Number(source.confidence) : 0.85)),
    supplemental_request: supplementalRequest,
    result_presentation: ["default", "preview", "pdf", "download", "both", "none"].includes(presentation) ? presentation : "default",
    replacement_goal: semanticBoolean(source.g ?? source.replacement_goal),
    explanation: text(source.explanation, 300) || null,
    authorization_effect: "NONE",
  };
}
export async function interpretPendingActionReply({
  organizationId, partyId = null, entityId = null, message, pending = {}, conversation = [],
} = {}) {
  const organization = text(organizationId, 200);
  const userMessage = text(message, 12000);
  const capabilityKey = text(pending?.capability_key, 300);
  if (!organization || !userMessage || !capabilityKey) return null;
  const recent = list(conversation).slice(-6).map((turn) => ({ role: turn?.role === "assistant" ? "assistant" : "user", content: text(turn?.content, 700) })).filter((turn) => turn.content);
  try {
    const content = JSON.stringify({
      message: userMessage,
      pending_action: {
        capability_key: capabilityKey,
        description: text(pending?.description || pending?.objective || pending?.reason, 500) || null,
        payload: compactPayload(pending?.payload),
      },
      recent: recent.slice(-4),
    });
    const base = {
      organization_id: organization,
      party_id: text(partyId, 200) || null,
      entity_id: text(entityId, 200) || null,
      messages: [{ role: "user", content }],
      authorization: { allow_mutating_tools: false },
      tools: [],
      expect_json: false,
      temperature: 0.0,
      max_output_tokens: 12,
      allow_fast_escalation: false,
    };
    const [relationExecution, presentationExecution] = await Promise.all([
      runOperatorFrontCognition({ ...base, front_task_mode: "pending_action_relation", metadata: { module: "OPERATOR", operation: "PENDING_ACTION_RELATION_INTERPRETATION", raw_reasoning_persisted: false } }),
      runOperatorFrontCognition({ ...base, front_task_mode: "pending_action_presentation", metadata: { module: "OPERATOR", operation: "PENDING_ACTION_PRESENTATION_INTERPRETATION", raw_reasoning_persisted: false } }),
    ]);
    const relationEnvelope = Object.fromEntries(text(relationExecution?.text, 500).split(";").map((part) => part.split("=").map((item) => item.trim())).filter((pair) => pair.length === 2));
    const presentationEnvelope = Object.fromEntries(text(presentationExecution?.text, 500).split(";").map((part) => part.split("=").map((item) => item.trim())).filter((pair) => pair.length === 2));
    const parsed = { relation: relationEnvelope.q, result_presentation: presentationEnvelope.p };
    const result = normalizeResult(parsed);
    if (!result) return null;
    if (["cancel", "revise", "new_goal"].includes(result.relation)) result.result_presentation = "none";
    result.replacement_goal = result.relation === "new_goal";
    return result;
  } catch (error) {
    console.error("OPERATOR_PENDING_ACTION_SEMANTIC_INTERPRETATION_FAILED", { capability_key: capabilityKey, error: text(error?.message || error, 500) });
    return null;
  }
}

export default interpretPendingActionReply;
