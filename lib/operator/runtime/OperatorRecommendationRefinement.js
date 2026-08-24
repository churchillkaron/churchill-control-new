function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function proposalId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `operator_refinement_${Date.now()}_${random}`;
}

const RECOMMENDATION_REFINEMENT_PATTERNS = [
  /^(?:what about|how about|what if|could we|would it be better to)\s+.+$/,
  /^should we\s+.+\s+instead$/,
  /^(?:change|switch|replace|adjust|refine|modify)\s+.+$/,
  /^.+\s+(?:instead|rather than)\s+.+$/,

  /^(?:vad sags om|hur vore det om|tank om|skulle vi kunna|vore det battre att)\s+.+$/,
  /^borde vi\s+.+\s+(?:istallet|i stallet)$/,
  /^(?:andra|byt|byta|ersatt|ersatta|justera|forfina|modifiera)\s+.+$/,
  /^.+\s+(?:istallet for|i stallet for|hellre an)\s+.+$/,

  /^(?:was ist mit|wie ware es mit|was wenn|konnten wir|ware es besser)\s+.+$/,
  /^sollten wir\s+.+\s+stattdessen$/,
  /^(?:andern|wechseln|ersetzen|anpassen|verfeinern|modifizieren)\s+.+$/,
  /^.+\s+(?:stattdessen|anstatt)\s+.+$/,

  /^(?:et si|qu en est il de|que dirais tu de|pourrait on|serait il preferable de)\s+.+$/,
  /^devrions nous\s+.+\s+plutot$/,
  /^(?:change|changer|remplace|remplacer|ajuste|ajuster|affine|affiner|modifie|modifier)\s+.+$/,
  /^.+\s+(?:plutot que|a la place de)\s+.+$/,

  /^(?:que tal si|y si|podriamos|seria mejor)\s+.+$/,
  /^deberiamos\s+.+\s+(?:en vez de|en lugar de)\s+.+$/,
  /^(?:cambia|cambiar|reemplaza|reemplazar|ajusta|ajustar|refina|refinar|modifica|modificar)\s+.+$/,
  /^.+\s+(?:en vez de|en lugar de)\s+.+$/,

  /^(?:แล้วถ้า|ถ้า).+$/u,
  /^เราสามารถ.+ไหม$/u,
  /^จะดีกว่าไหมถ้า.+$/u,
  /^ควร.+แทน.+$/u,
  /^(?:เปลี่ยน|ปรับ|แทนที่|ปรับแก้).+$/u,
  /^.+แทนที่จะ.+$/u,
];

const RECOMMENDATION_REFINEMENT_SELECT = new Set([
  "yes",
  "yes please",
  "i prefer that",
  "i prefer this",
  "prefer that",
  "prefer this",
  "i choose that",
  "i choose this",
  "choose that",
  "choose this",
  "lets go with that",
  "let us go with that",
  "lets use that direction",
  "let us use that direction",
  "use that direction",
  "that is better",
  "thats better",
  "sounds good",
  "good idea",

  "ja",
  "jag foredrar det",
  "jag foredrar den",
  "jag valjer det",
  "jag valjer den",
  "vi tar det",
  "vi tar den",
  "anvand den riktningen",
  "det ar battre",
  "den ar battre",
  "later bra",
  "bra ide",

  "ich bevorzuge das",
  "ich bevorzuge diese option",
  "ich wahle das",
  "ich wahle diese option",
  "nehmen wir das",
  "nehmen wir diese option",
  "nutzen wir diese richtung",
  "das ist besser",
  "klingt gut",

  "oui",
  "je prefere ca",
  "je prefere cette option",
  "je choisis ca",
  "je choisis cette option",
  "prenons ca",
  "prenons cette option",
  "utilisons cette direction",
  "c est mieux",
  "d accord",
  "bonne idee",

  "si",
  "prefiero eso",
  "prefiero esta opcion",
  "elijo eso",
  "elijo esta opcion",
  "usemos eso",
  "usemos esta direccion",
  "eso es mejor",
  "de acuerdo",
  "buena idea",

  "ใช่",
  "ฉันชอบอันนี้มากกว่า",
  "ฉันเลือกอันนี้",
  "เลือกอันนี้",
  "เอาอันนี้",
  "ใช้แนวทางนี้",
  "อันนี้ดีกว่า",
  "ตกลง",
]);

const RECOMMENDATION_REFINEMENT_REJECT = new Set([
  "no",
  "no thanks",
  "reject that",
  "reject this",
  "keep the original",
  "keep the old recommendation",
  "go back to the original",

  "nej",
  "behold den gamla rekommendationen",
  "behall den gamla rekommendationen",
  "ga tillbaka till den ursprungliga",

  "nein",
  "behalte die alte empfehlung",
  "bleiben wir bei der alten empfehlung",

  "non",
  "garde l ancienne recommandation",
  "revenons a la recommandation initiale",

  "no",
  "mantengamos la recomendacion anterior",
  "volvamos a la recomendacion original",

  "ไม่",
  "ใช้คำแนะนำเดิม",
  "กลับไปใช้คำแนะนำเดิม",
]);

export function isRecommendationRefinementMessage(value) {
  const message = normalized(value);
  if (!message) return false;
  return RECOMMENDATION_REFINEMENT_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

export const RECOMMENDATION_ALTERNATIVE_PATTERN = Object.freeze({
  test: isRecommendationRefinementMessage,
});

export function normalizeRecommendationRefinementProposal(value = {}) {
  const candidate = object(value);
  const proposalText = text(candidate.proposal_text, 4000);
  if (!proposalText) return null;

  const status = text(candidate.status, 40).toUpperCase();
  if (!["PROPOSED", "SELECTED", "REJECTED"].includes(status)) return null;

  return {
    proposal_id: text(candidate.proposal_id, 160) || null,
    proposal_kind: "recommendation_refinement",
    status,
    proposal_text: proposalText,
    previous_recommendation_id:
      text(candidate.previous_recommendation_id, 160) || null,
    previous_capability_key:
      text(candidate.previous_capability_key, 240) || null,
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    requires_explicit_decision: status === "PROPOSED",
    requires_governed_materialization: status === "SELECTED",
    decision_effect:
      status === "PROPOSED" ? null : "DIRECTION_ONLY",
    decision_message: text(candidate.decision_message, 1000) || null,
    selected_at: text(candidate.selected_at, 80) || null,
    rejected_at: text(candidate.rejected_at, 80) || null,
    source: "operator_recommendation_refinement",
    created_at: text(candidate.created_at, 80) || new Date().toISOString(),
  };
}

export function recommendationRefinementProposalFromAgreementState(
  agreementState = {},
) {
  return normalizeRecommendationRefinementProposal(
    object(agreementState).recommendation_refinement_proposal,
  );
}

export function createRecommendationRefinementProposal({
  message,
  recommendation,
} = {}) {
  const proposalText = text(message, 4000);
  if (!isRecommendationRefinementMessage(proposalText)) return null;

  const previous = object(recommendation);
  return normalizeRecommendationRefinementProposal({
    proposal_id: proposalId(),
    proposal_kind: "recommendation_refinement",
    status: "PROPOSED",
    proposal_text: proposalText,
    previous_recommendation_id:
      text(previous.recommendation_id, 160) || null,
    previous_capability_key:
      text(previous.capability_key, 240) || null,
    created_at: new Date().toISOString(),
  });
}

export function recommendationRefinementDecisionSafe(
  agreementState = {},
  proposal = null,
) {
  const current = object(agreementState);
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || current.recommendation_refinement_proposal,
  );
  if (!normalizedProposal || normalizedProposal.status !== "PROPOSED") {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(current, "pending_execution") ||
    Object.prototype.hasOwnProperty.call(current, "autonomous_run")
  ) {
    return false;
  }
  return true;
}

export function classifyRecommendationRefinementReply({
  message,
  agreementState = {},
  proposal = null,
} = {}) {
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || object(agreementState).recommendation_refinement_proposal,
  );
  if (
    !normalizedProposal ||
    !recommendationRefinementDecisionSafe(agreementState, normalizedProposal)
  ) {
    return null;
  }

  const clean = normalized(message);
  if (!clean) return null;
  if (RECOMMENDATION_REFINEMENT_REJECT.has(clean)) return "reject";
  if (RECOMMENDATION_REFINEMENT_SELECT.has(clean)) return "select";
  return null;
}

export function agreementWithRecommendationRefinementDecision(
  agreementState = {},
  { outcome, message, proposal = null } = {},
) {
  const current = object(agreementState);
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || current.recommendation_refinement_proposal,
  );
  if (
    !normalizedProposal ||
    !recommendationRefinementDecisionSafe(current, normalizedProposal)
  ) {
    return current;
  }

  const decision = text(outcome, 40).toLowerCase();
  if (!["select", "reject"].includes(decision)) return current;

  const selected = decision === "select";
  const now = new Date().toISOString();
  return {
    ...current,
    recommendation_refinement_proposal: normalizeRecommendationRefinementProposal({
      ...normalizedProposal,
      status: selected ? "SELECTED" : "REJECTED",
      decision_message: text(message, 1000) || null,
      selected_at: selected ? now : null,
      rejected_at: selected ? null : now,
    }),
  };
}
