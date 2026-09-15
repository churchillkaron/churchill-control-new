function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function isStill(plan = {}) {
  return text(plan.workflow_kind).toUpperCase() === "STILL";
}

function temporalNarrative(value) {
  return /\b(?:transform(?:ation|s|ed|ing)?|movement|moves?|moving|trigger(?:ed|s|ing)?|evolv(?:e|es|ed|ing)|progress(?:ion|es|ed|ing)?|ascend(?:s|ed|ing)?|animation|sequence)\b/i.test(text(value));
}

function staticNarrative(plan = {}, step = {}) {
  const device = text(step.requirements?.selected_signature_device || plan.concept?.signature_device || plan.concept?.title || "the selected visual system");
  return `Static one-frame representation of ${device}, communicating the unified workflow through composition, spatial hierarchy and light relationships only; no animation, object movement or temporal transformation.`;
}

export function normalizeCreativeStillPlan(plan = {}) {
  if (!isStill(plan)) return plan;
  const next = structuredClone(plan);
  const concept = object(next.concept);
  const visualSystem = object(concept.visual_system);
  next.concept = {
    ...concept,
    visual_system: {
      ...visualSystem,
      editing_language: "N/A — single still composition with no cuts, transitions, animation or temporal progression.",
    },
  };
  next.deliverables = list(next.deliverables).map((deliverable) => ({
    ...deliverable,
    production_steps: list(deliverable.production_steps).map((step) => {
      const outputSpec = object(step.output_spec);
      if (!temporalNarrative(outputSpec.narrative_structure)) return step;
      return {
        ...step,
        output_spec: {
          ...outputSpec,
          narrative_structure: staticNarrative(next, step),
        },
      };
    }),
  }));
  return next;
}

export const CreativeStillPlanNormalizationRuntime = Object.freeze({
  contract: "CREATIVE_STILL_PLAN_NORMALIZATION_V1",
  normalize: normalizeCreativeStillPlan,
});
