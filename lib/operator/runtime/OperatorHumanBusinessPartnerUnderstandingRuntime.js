export const HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT = "AVANTIQO_HUMAN_BUSINESS_PARTNER_UNDERSTANDING_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeHumanBusinessPartnerUnderstanding(value) {
  const source = object(value);
  const route = text(source.route, 40).toLowerCase();
  if (!["conversation", "evidence", "governed"].includes(route)) return null;
  const scope = text(source.evidence_scope, 40).toLowerCase();
  const conversationMode = text(source.conversation_mode, 40).toLowerCase();
  const contextDepth = text(source.context_depth, 40).toLowerCase();
  const responseDetail = text(source.response_detail, 40).toLowerCase();
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route,
    evidence_scope: ["none", "internal", "external", "both"].includes(scope) ? scope : "none",
    reasoning_depth: text(source.reasoning_depth, 40).toLowerCase() === "deep" ? "deep" : "fast",
    conversation_mode: ["light", "strategic", "creative", "analytical"].includes(conversationMode) ? conversationMode : "light",
    context_depth: contextDepth === "expanded" ? "expanded" : "compact",
    response_detail: ["brief", "normal", "deep"].includes(responseDetail) ? responseDetail : "normal",
    continuity_required: source.continuity_required === true,
    correction_or_revision: source.correction_or_revision === true,
    user_goal: text(source.user_goal, 1400) || null,
    requires_mutation: source.requires_mutation === true,
    needs_current_evidence: source.needs_current_evidence === true,
  };
}

export async function understandHumanBusinessPartnerTurn(options = {}) {
  const organizationId = text(options.organizationId, 160);
  const message = text(options.message, 12000);
  if (!organizationId || !message) return null;

  const recent = list(options.conversation).slice(-8).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    content: text(turn?.content, 900),
  })).filter((turn) => turn.content);

  const { AvantiqoIntelligenceReasoningRuntime } = await import("@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime");
  const execution = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    party_id: text(options.partyId, 160) || null,
    entity_id: text(options.entityId, 160) || null,
    system: [
      "Understand the user's meaning from the whole supplied conversation, not from keywords.",
      "Classify the next step as conversation, evidence, or governed.",
      "Use conversation for discussion, strategy, creative thinking and advice that can be answered from context.",
      "Use evidence when fresh internal or external facts or research materially improve the answer.",
      "Use governed when the user wants a real state-changing operation.",
      "Also infer how the conversation itself should behave: conversation_mode is light, strategic, creative, or analytical; context_depth is compact or expanded; response_detail is brief, normal, or deep.",
      "Set continuity_required when the current turn depends materially on prior discussion, project intent, earlier options, references such as 'that one'/'the second one', or an ongoing creative/strategic thread.",
      "Set correction_or_revision when the user is correcting, rejecting, refining, changing, or revising an earlier interpretation, option, decision, or output.",
      "Do not use literal keywords as the decision rule; infer these fields from meaning and conversational context.",
      "This classification grants no authority. Governance is enforced later.",
      "Return JSON only with route, evidence_scope, reasoning_depth, conversation_mode, context_depth, response_detail, continuity_required, correction_or_revision, user_goal, requires_mutation, needs_current_evidence."
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ message, recent }) }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "OPERATOR", operation: "HUMAN_BUSINESS_PARTNER_SEMANTIC_UNDERSTANDING", raw_reasoning_persisted: false },
    execution_lane: "fast",
    temperature: 0.05,
    response_format: { type: "json_object" },
    max_output_tokens: 240,
    max_turns: 1,
    max_tool_calls: 0,
  });

  try {
    return normalizeHumanBusinessPartnerUnderstanding(JSON.parse(text(execution?.text, 5000)));
  } catch {
    return null;
  }
}

export default understandHumanBusinessPartnerTurn;
