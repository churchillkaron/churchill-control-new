function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function semanticClarificationTurn(options = {}) {
  const semantic = object(options.semanticUnderstanding);
  if (semantic.clarification_required !== true) return null;

  const agreementState = object(options.agreementState);
  const projectState = object(options.projectState);
  const question = text(semantic.clarification_question, 700) ||
    "I can interpret that in more than one materially different way. Which outcome do you mean?";
  const choices = Array.isArray(semantic.candidate_interpretations)
    ? semantic.candidate_interpretations.slice(0, 3)
        .map((label, index) => ({ id: `interpretation-${index + 1}`, label: text(label, 500) }))
        .filter((item) => item.label)
    : [];
  return {
    success: true,
    decision: {
      response_text: question,
      response_language: text(options.locale, 80) || null,
      intent: "clarify",
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification: { required: true, question, options: choices },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: agreementState,
    navigation: null,
    execution: null,
    provider_evidence: { provider: "avantiqo-local", model: "semantic-clarification-v1", usage_id: null },
    operator_catalog: { semantic_clarification: true, mutation_executed: false },
  };
}

export default semanticClarificationTurn;
