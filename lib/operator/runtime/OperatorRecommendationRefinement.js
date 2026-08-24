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
  "yes i prefer that",
  "yes i prefer this",
  "yes choose that",
  "yes choose this",
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
  "ja jag foredrar det",
  "ja jag foredrar den",
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
  "ja ich bevorzuge das",
  "ich bevorzuge diese option",
  "ich wahle das",
  "ich wahle diese option",
  "nehmen wir das",
  "nehmen wir diese option",
  "nutzen wir diese richtung",
  "das ist besser",
  "klingt gut",

  "oui",
  "oui je prefere ca",
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
  "si prefiero eso",
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
  "ใช่ ฉันชอบอันนี้มากกว่า",
  "ฉันชอบอันนี้มากกว่า",
  "ฉันเลือกอันนี้",
  "เลือกอันนี้",
  "เอาอันนี้",
  "ใช้แนวทางนี้",
  "อันนี้ดีกว่า",
  "ตกลง",
]);

const RECOMMENDATION_REFINEMENT_RESTORE_ORIGINAL = new Set([
  "keep the original",
  "keep the old recommendation",
  "go back to the original",
  "use the original",
  "use the old recommendation",

  "behold den gamla rekommendationen",
  "behall den gamla rekommendationen",
  "ga tillbaka till den ursprungliga",
  "anvand den ursprungliga",

  "behalte die alte empfehlung",
  "bleiben wir bei der alten empfehlung",
  "zuruck zur ursprunglichen empfehlung",

  "garde l ancienne recommandation",
  "revenons a la recommandation initiale",
  "utilisons la recommandation initiale",

  "mantengamos la recomendacion anterior",
  "volvamos a la recomendacion original",
  "usemos la recomendacion original",

  "ใช้คำแนะนำเดิม",
  "กลับไปใช้คำแนะนำเดิม",
  "เลือกคำแนะนำเดิม",
]);

const RECOMMENDATION_REFINEMENT_REJECT = new Set([
  "no",
  "no thanks",
  "reject that",
  "reject this",
  "nej",
  "nein",
  "non",
  "no",
  "ไม่",
]);

const RECOMMENDATION_REFINEMENT_MATERIALIZE = new Set([
  "make that the new recommendation",
  "make this the new recommendation",
  "turn that into an exact action",
  "turn this into an exact action",
  "turn that into the exact action",
  "turn this into the exact action",
  "materialize that direction",
  "materialize this direction",
  "prepare the exact action",
  "prepare that as the exact action",

  "gor det till den nya rekommendationen",
  "gor detta till den nya rekommendationen",
  "gor om det till en exakt atgard",
  "gor om detta till en exakt atgard",
  "forbered den exakta atgarden",

  "mach das zur neuen empfehlung",
  "mach dies zur neuen empfehlung",
  "mach daraus eine genaue aktion",
  "bereite die genaue aktion vor",

  "fais en la nouvelle recommandation",
  "fais de ceci la nouvelle recommandation",
  "transforme cela en action exacte",
  "prepare l action exacte",

  "haz que esa sea la nueva recomendacion",
  "haz que esta sea la nueva recomendacion",
  "convierte eso en una accion exacta",
  "prepara la accion exacta",

  "ทำให้เป็นคำแนะนำใหม่",
  "ทำให้อันนี้เป็นคำแนะนำใหม่",
  "เปลี่ยนเป็นการดำเนินการที่ชัดเจน",
  "เตรียมการดำเนินการที่ชัดเจน",
]);

const RECOMMENDATION_REFINEMENT_ADVANCE = new Set([
  "continue",
  "continue now",
  "continue with that",
  "continue with this",
  "continue with that direction",
  "continue with this direction",
  "next",
  "next step",
  "keep going",
  "carry on",

  "fortsatt",
  "fortsatt nu",
  "fortsatt med den riktningen",
  "nasta",
  "nasta steg",

  "weiter",
  "mach weiter",
  "weiter mit dieser richtung",
  "nachster schritt",

  "continue",
  "reprends",
  "continue avec cette direction",
  "prochaine etape",

  "continua",
  "reanuda",
  "continua con esa direccion",
  "siguiente",
  "siguiente paso",

  "ทำต่อ",
  "ทำต่อเลย",
  "ทำต่อกับแนวทางนี้",
  "ต่อไป",
  "ขั้นตอนต่อไป",
]);

const RECOMMENDATION_REFINEMENT_STATUS = new Set([
  "what did we choose",
  "what did i choose",
  "what did we select",
  "what did i select",
  "what direction did we choose",
  "what direction did we select",
  "what refinement did we choose",
  "what refinement did we select",
  "what is selected",
  "whats selected",
  "which direction is selected",
  "what did we decide",
  "what have we decided",
  "what was the decision",
  "what did i decide",
  "what did we agree",
  "remind me what we decided",

  "vad valde vi",
  "vad valde jag",
  "vilken riktning valde vi",
  "vilket alternativ valde vi",
  "vad ar valt",
  "vilken riktning ar vald",
  "vad beslutade vi",
  "vad bestamde vi",
  "vad kom vi overens om",

  "was haben wir gewahlt",
  "was habe ich gewahlt",
  "welche richtung haben wir gewahlt",
  "welche option haben wir gewahlt",
  "was ist ausgewahlt",
  "was haben wir entschieden",
  "worauf haben wir uns geeinigt",

  "qu avons nous choisi",
  "qu ai je choisi",
  "quelle direction avons nous choisie",
  "quelle option avons nous choisie",
  "qu est ce qui est selectionne",
  "qu avons nous decide",
  "sur quoi nous sommes nous mis d accord",

  "que elegimos",
  "que elegi",
  "que direccion elegimos",
  "que opcion elegimos",
  "que esta seleccionado",
  "que decidimos",
  "en que quedamos",

  "เราเลือกอะไร",
  "ฉันเลือกอะไร",
  "เราเลือกแนวทางไหน",
  "เราเลือกตัวเลือกไหน",
  "ตอนนี้เลือกอะไรอยู่",
  "เราตัดสินใจอะไร",
  "เราตกลงอะไรกัน",
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

export function isRecommendationRefinementStatusMessage(value) {
  return RECOMMENDATION_REFINEMENT_STATUS.has(normalized(value));
}

export function normalizeRecommendationRefinementProposal(value = {}) {
  const candidate = object(value);
  const proposalText = text(candidate.proposal_text, 4000);
  if (!proposalText) return null;

  const status = text(candidate.status, 40).toUpperCase();
  if (!["PROPOSED", "SELECTED", "REJECTED", "MATERIALIZED"].includes(status)) {
    return null;
  }
  const materialized = status === "MATERIALIZED";

  return {
    proposal_id: text(candidate.proposal_id, 160) || null,
    proposal_kind: "recommendation_refinement",
    status,
    proposal_text: proposalText,
    previous_recommendation_id:
      text(candidate.previous_recommendation_id, 160) || null,
    previous_capability_key:
      text(candidate.previous_capability_key, 240) || null,
    previous_recommendation_description:
      text(candidate.previous_recommendation_description, 1200) || null,
    selection_origin:
      text(candidate.selection_origin, 80) || "REFINEMENT_PROPOSAL",
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: materialized,
    autonomous_run_created: materialized,
    materialization_effect: materialized
      ? "GOVERNED_PENDING_RECOMMENDATION_CREATED"
      : "NONE",
    requires_explicit_decision: status === "PROPOSED",
    requires_governed_materialization: status === "SELECTED",
    decision_effect:
      status === "PROPOSED" ? null : "DIRECTION_ONLY",
    decision_message: text(candidate.decision_message, 1000) || null,
    selected_at: text(candidate.selected_at, 80) || null,
    rejected_at: text(candidate.rejected_at, 80) || null,
    materialized_recommendation_id:
      text(candidate.materialized_recommendation_id, 160) || null,
    materialized_capability_key:
      text(candidate.materialized_capability_key, 240) || null,
    materialized_at: text(candidate.materialized_at, 80) || null,
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
    previous_recommendation_description:
      text(previous.description, 1200) || text(previous.reason, 1200) || null,
    selection_origin: "REFINEMENT_PROPOSAL",
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
  if (RECOMMENDATION_REFINEMENT_RESTORE_ORIGINAL.has(clean)) {
    return "restore_original";
  }
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
  if (!["select", "reject", "restore_original"].includes(decision)) {
    return current;
  }

  const restoredOriginal = decision === "restore_original";
  const selected = decision === "select" || restoredOriginal;
  const restoredDescription = text(
    normalizedProposal.previous_recommendation_description,
    1200,
  );
  if (restoredOriginal && !restoredDescription) return current;

  const now = new Date().toISOString();
  return {
    ...current,
    recommendation_refinement_proposal: normalizeRecommendationRefinementProposal({
      ...normalizedProposal,
      status: selected ? "SELECTED" : "REJECTED",
      proposal_text: restoredOriginal
        ? restoredDescription
        : normalizedProposal.proposal_text,
      selection_origin: restoredOriginal
        ? "ORIGINAL_RECOMMENDATION_CONTEXT"
        : normalizedProposal.selection_origin,
      decision_message: text(message, 1000) || null,
      selected_at: selected ? now : null,
      rejected_at: selected ? null : now,
    }),
  };
}

export function recommendationRefinementMaterializationSafe(
  agreementState = {},
  proposal = null,
) {
  const current = object(agreementState);
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || current.recommendation_refinement_proposal,
  );
  if (!normalizedProposal || normalizedProposal.status !== "SELECTED") {
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

export function classifyRecommendationRefinementMaterializationRequest({
  message,
  agreementState = {},
  proposal = null,
} = {}) {
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || object(agreementState).recommendation_refinement_proposal,
  );
  if (
    !normalizedProposal ||
    !recommendationRefinementMaterializationSafe(
      agreementState,
      normalizedProposal,
    )
  ) {
    return false;
  }
  return RECOMMENDATION_REFINEMENT_MATERIALIZE.has(normalized(message));
}

export function classifyRecommendationRefinementAdvanceRequest({
  message,
  agreementState = {},
  proposal = null,
} = {}) {
  const normalizedProposal = normalizeRecommendationRefinementProposal(
    proposal || object(agreementState).recommendation_refinement_proposal,
  );
  if (
    !normalizedProposal ||
    !recommendationRefinementMaterializationSafe(
      agreementState,
      normalizedProposal,
    )
  ) {
    return false;
  }
  return RECOMMENDATION_REFINEMENT_ADVANCE.has(normalized(message));
}

export function agreementWithRecommendationRefinementMaterialized(
  agreementState = {},
  recommendation = null,
) {
  const current = object(agreementState);
  const proposal = normalizeRecommendationRefinementProposal(
    current.recommendation_refinement_proposal,
  );
  const recommended = object(recommendation);
  const recommendationId = text(recommended.recommendation_id, 160);
  const capabilityKey = text(recommended.capability_key, 240);
  const pending = object(current.pending_execution);
  const run = object(current.autonomous_run);
  if (
    !proposal ||
    proposal.status !== "SELECTED" ||
    !recommendationId ||
    !capabilityKey ||
    text(pending.recommendation_id, 160) !== recommendationId ||
    text(pending.capability_key, 240) !== capabilityKey ||
    !text(run.run_id, 240) ||
    text(run.run_kind, 40).toLowerCase() !== "single_action"
  ) {
    return current;
  }

  return {
    ...current,
    recommendation_refinement_proposal: normalizeRecommendationRefinementProposal({
      ...proposal,
      status: "MATERIALIZED",
      materialized_recommendation_id: recommendationId,
      materialized_capability_key: capabilityKey,
      materialized_at: new Date().toISOString(),
    }),
  };
}
