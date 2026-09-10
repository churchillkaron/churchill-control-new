import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  ownedOperatorIntelligenceSelectionPolicy,
  settleOperatorIntelligenceExecution,
} from "./OperatorOwnedIntelligenceServiceRuntime";

const CONTRACT = "AVANTIQO_RECIPE_CLARIFICATION_INTELLIGENCE_V1";
const text = (value, limit = 8000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];

function findText(value, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) { const found = findText(entry, depth + 1); if (found) return found; }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1); if (found) return found;
  }
  return "";
}

function parseJson(value) {
  const source = text(value, 30000);
  if (!source) return null;
  for (const candidate of [source, source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1)]) {
    try { const parsed = JSON.parse(candidate); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed; } catch {}
  }
  return null;
}

export async function reasonRecipeClarification({ organizationId, partyId, entityId = null, locale = null, message = "", candidate = {}, attachment = {} } = {}) {
  if (!organizationId || !partyId) throw new Error("RECIPE_CLARIFICATION_CONTEXT_REQUIRED");
  const request = {
    contract: CONTRACT,
    user_message: text(message, 4000),
    locale: text(locale, 80) || null,
    verified_recipe_state: {
      status: text(candidate.status, 80),
      dish: object(candidate.dish),
      recipe_output: object(candidate.recipe_output),
      recipe_items: list(candidate.recipe_items),
      clarification_context: object(candidate.clarification_context),
      source_evidence: object(object(attachment.analysis).evidence),
    },
  };
  const instructions = `You are Avantiqo Intelligence reasoning as an experienced restaurant operator and food-cost controller. A deterministic validator has parsed and validated a recipe upload. Study only the supplied verified_recipe_state and source_evidence. Decide whether any materially important fact is still missing for correct real-world costing. Deterministic status CLARIFICATION_REQUIRED always requires clarification. READY_FOR_REVIEW may still require clarification when the evidence leaves a material operational costing uncertainty, such as an unevidenced yield on an ingredient where preparation loss appears relevant or missing batch output for a reusable preparation. This is judgment, not a fixed checklist. If clarification is needed, ask exactly one concise practical question a restaurant owner, chef, purchaser or accountant can answer. Do not invent yield, waste, SKU, UOM, batch output, dish identity, preparation identity or conversion. If yield is materially uncertain, prefer asking about observable quantities (for example purchased/raw quantity versus usable/prepared output) when that is easier for a human to answer than an abstract percentage. Never authorize or execute a write. Return strict JSON only: {"clarification_required":true,"question":"...","reason":"...","missing_fact":"..."}. If nothing material is missing, set clarification_required=false and question=null.`;

  let execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    ...ownedOperatorIntelligenceSelectionPolicy(),
    input: { input: JSON.stringify(request), instructions_text: instructions, max_output_tokens: 180, text: { verbosity: "low" }, response_format: { type: "json_object" } },
    metadata: { module: "OPERATOR", operation: "RECIPE_CLARIFICATION_REASONING", authorization_effect: "NONE", deterministic_validation_preserved: true },
    category: "AI",
  });
  execution = await settleOperatorIntelligenceExecution({
    organization_id: organizationId,
    execution,
    service_id: "ai.text.generate",
    execution_lane: "fast",
    metadata: { module: "OPERATOR", operation: "RECIPE_CLARIFICATION_REASONING_SETTLEMENT", raw_reasoning_persisted: false },
  });
  const parsed = parseJson(findText(execution));
  const required = parsed?.clarification_required === true || text(candidate.status, 80) === "CLARIFICATION_REQUIRED";
  const question = text(parsed?.question, 1200);
  if (required && !question) throw new Error("RECIPE_CLARIFICATION_QUESTION_REQUIRED");
  return { contract: CONTRACT, clarification_required: required, question: question || null, reason: text(parsed?.reason, 1200) || null, missing_fact: text(parsed?.missing_fact, 300) || null, provider_evidence: { provider: text(execution?.provider, 120) || "avantiqo-intelligence", model: text(execution?.model, 240) || null, usage_id: execution?.usage?.id || execution?.usage_id || null } };
}

export default reasonRecipeClarification;
