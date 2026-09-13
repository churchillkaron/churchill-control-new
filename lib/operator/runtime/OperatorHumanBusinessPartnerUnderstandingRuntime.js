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

function compactSemanticContext(options = {}) {
  const project = object(options.projectState);
  const agreement = object(options.agreementState);
  const pending = object(agreement.pending_execution);
  const recommendation = object(agreement.operator_recommendation || agreement.recommendation);
  const memory = list(options.longTermMemory)
    .slice(0, 8)
    .map((item) => ({
      type: text(item?.memory_type || item?.type, 80) || null,
      subject: text(item?.subject, 180) || null,
      content: text(item?.content, 500) || null,
    }))
    .filter((item) => item.content);

  return {
    project: {
      objective: text(project.objective, 900) || null,
      status: text(project.status, 80) || null,
      decisions: list(project.decisions).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      constraints: list(project.constraints).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      completed_steps: list(project.completed_steps).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      progress_summary: text(project.progress_summary, 900) || null,
      next_step: text(project.next_step, 700) || null,
      blocker: text(project.blocker, 700) || null,
    },
    pending_action: text(pending.capability_key, 300) ? {
      capability_key: text(pending.capability_key, 300),
      description: text(pending.description || pending.objective || pending.reason, 800) || null,
      authorization_requirement: text(pending.authorization_requirement, 120) || null,
    } : null,
    recommendation: Object.keys(recommendation).length ? {
      description: text(recommendation.description || recommendation.objective, 800) || null,
      capability_key: text(recommendation.capability_key, 300) || null,
    } : null,
    long_term_memory: memory,
    current_screen: text(options.pathname || options.currentScreen, 500) || null,
  };
}

export function normalizeHumanBusinessPartnerUnderstanding(value) {
  const source = object(value);
  const route = text(source.route, 40).toLowerCase();
  if (!["conversation", "evidence", "governed"].includes(route)) return null;
  const scope = text(source.evidence_scope, 40).toLowerCase();
  const conversationMode = text(source.conversation_mode, 40).toLowerCase();
  const contextDepth = text(source.context_depth, 40).toLowerCase();
  const responseDetail = text(source.response_detail, 40).toLowerCase();
  const executionDomain = text(source.execution_domain, 40).toLowerCase();
  const engineeringScope = text(source.engineering_scope, 40).toLowerCase();
  const engineeringMode = text(source.engineering_mode, 40).toLowerCase();
  const normalizedDomain = ["none", "business", "product_engineering"].includes(executionDomain) ? executionDomain : "none";
  const normalizedEngineeringMode = ["inspect", "change"].includes(engineeringMode) ? engineeringMode : null;
  const productEngineeringInspection = normalizedDomain === "product_engineering" && normalizedEngineeringMode === "inspect";
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: productEngineeringInspection ? "governed" : route,
    evidence_scope: ["none", "internal", "external", "both"].includes(scope) ? scope : "none",
    reasoning_depth: text(source.reasoning_depth, 40).toLowerCase() === "deep" ? "deep" : "fast",
    conversation_mode: ["light", "strategic", "creative", "analytical"].includes(conversationMode) ? conversationMode : "light",
    context_depth: contextDepth === "expanded" ? "expanded" : "compact",
    response_detail: ["brief", "normal", "deep"].includes(responseDetail) ? responseDetail : "normal",
    continuity_required: source.continuity_required === true,
    correction_or_revision: source.correction_or_revision === true,
    execution_domain: normalizedDomain,
    engineering_scope: ["single", "portfolio"].includes(engineeringScope) ? engineeringScope : null,
    engineering_mode: normalizedEngineeringMode,
    user_goal: text(source.user_goal, 1400) || null,
    requires_mutation: productEngineeringInspection ? false : source.requires_mutation === true,
    needs_current_evidence: productEngineeringInspection ? true : source.needs_current_evidence === true,
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
  const semanticContext = compactSemanticContext(options);

  const { AvantiqoIntelligenceReasoningRuntime } = await import("@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime");
  const execution = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    party_id: text(options.partyId, 160) || null,
    entity_id: text(options.entityId, 160) || null,
    system: [
      "Understand the user's meaning from the whole supplied conversation and durable working context, not from keywords.",
      "Treat project state, accepted decisions, constraints, pending action, recommendation, long-term memory and current screen as context for reference resolution, not as new authorization.",
      "When the user uses ellipsis, pronouns, ordinal references, corrections, or shorthand, resolve them against the supplied context when the referent is materially clear; otherwise prefer one focused clarification instead of guessing.",
      "Classify the next step as conversation, evidence, or governed.",
      "Use conversation for discussion, strategy, creative thinking and advice that can be answered from context.",
      "Use evidence when fresh internal or external facts or research materially improve the answer.",
      "Use governed when the user wants a real state-changing operation or specialized governed execution/evidence lane.",
      "Infer execution_domain as none, business, or product_engineering from the actual goal.",
      "Product_engineering covers requests about Avantiqo product behavior, source, workflow, UI, capability, or architecture; business covers organization operations through registered capabilities.",
      "For product_engineering, infer engineering_scope as single or portfolio and engineering_mode as inspect or change.",
      "For product_engineering inspection, use route governed, engineering_mode inspect, requires_mutation false, and needs_current_evidence true so the dedicated read-only Code evidence lane can run without mutation authority.",
      "Do not require explicit technical keywords when the meaning clearly concerns the Avantiqo product.",
      "Also infer how the conversation itself should behave: conversation_mode is light, strategic, creative, or analytical; context_depth is compact or expanded; response_detail is brief, normal, or deep.",
      "Set continuity_required when the current turn depends materially on prior discussion, project intent, earlier options, references such as 'that one'/'the second one', or an ongoing creative/strategic thread.",
      "Set correction_or_revision when the user is correcting, rejecting, refining, changing, or revising an earlier interpretation, option, decision, or output.",
      "Do not use literal keywords as the decision rule; infer these fields from meaning and conversational context.",
      "This classification grants no authority. Governance is enforced later.",
      "Return JSON only with route, evidence_scope, reasoning_depth, conversation_mode, context_depth, response_detail, continuity_required, correction_or_revision, execution_domain, engineering_scope, engineering_mode, user_goal, requires_mutation, needs_current_evidence."
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ message, recent, context: semanticContext }) }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "OPERATOR", operation: "HUMAN_BUSINESS_PARTNER_SEMANTIC_UNDERSTANDING", raw_reasoning_persisted: false },
    execution_lane: "fast",
    temperature: 0.05,
    response_format: { type: "json_object" },
    max_output_tokens: 280,
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
