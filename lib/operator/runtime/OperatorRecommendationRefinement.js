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

export function createRecommendationRefinementProposal({
  message,
  recommendation,
} = {}) {
  const proposalText = text(message, 4000);
  if (!isRecommendationRefinementMessage(proposalText)) return null;

  const previous = object(recommendation);
  return {
    proposal_kind: "recommendation_refinement",
    status: "PROPOSED",
    proposal_text: proposalText,
    previous_recommendation_id:
      text(previous.recommendation_id, 160) || null,
    previous_capability_key:
      text(previous.capability_key, 240) || null,
    authorization_effect: "NONE",
    execution_authorized: false,
    pending_execution_created: false,
    autonomous_run_created: false,
    requires_explicit_decision: true,
    source: "operator_recommendation_refinement",
    created_at: new Date().toISOString(),
  };
}
