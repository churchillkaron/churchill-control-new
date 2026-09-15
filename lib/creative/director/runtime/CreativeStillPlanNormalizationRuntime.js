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
  return /\b(?:transform(?:ation|s|ed|ing)?|movement|moves?|moving|trigger(?:ed|s|ing)?|evolv(?:e|es|ed|ing)|progress(?:ion|es|ed|ing)?|changes?|changing|ascend(?:s|ed|ing)?|animation|sequence)\b/i.test(text(value));
}

function staticNarrative(plan = {}, step = {}) {
  const device = text(step.requirements?.selected_signature_device || plan.concept?.signature_device || plan.concept?.title || "the selected visual system");
  return `Static one-frame representation of ${device}, communicating the unified workflow through composition, spatial hierarchy and light relationships only; no animation, object movement or temporal transformation.`;
}

function finalStateLighting(value) {
  const source = text(value);
  if (!source || !temporalNarrative(source)) return source;
  const parts = source.split(/(?:→|->|\bthen\b|\bto\b)/i).map(text).filter(Boolean);
  const finalState = parts.at(-1)?.replace(/\([^)]*progress[^)]*\)/gi, "").trim();
  return `Static final-state lighting${finalState ? `: ${finalState}` : ""}; no temporal lighting progression.`;
}

function refusesPhysicalObjects(concept = {}) {
  return list(concept.refused_devices).some((entry) => /physical objects?|modular blocks?/i.test(text(entry))) ||
    /no (?:human elements or )?physical objects?/i.test(text(concept.hook));
}

function replaceForbiddenPhysicalMetaphor(value, signature) {
  if (Array.isArray(value)) return value.map((entry) => replaceForbiddenPhysicalMetaphor(entry, signature));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replaceForbiddenPhysicalMetaphor(nested, signature)]));
  }
  if (typeof value !== "string" || !/(?:\bblocks?\b|modular (?:blocks?|structure)|digital physical objects?|physical objects? simulation)/i.test(value)) return value;
  return `Abstract ${signature} composition using light, geometry and negative space only; no physical objects.`;
}

export function normalizeCreativeStillPlan(plan = {}) {
  if (!isStill(plan)) return plan;
  const next = structuredClone(plan);
  const concept = object(next.concept);
  const visualSystem = object(concept.visual_system);
  const signature = text(concept.signature_device || concept.title || "selected visual system");
  const normalizedConcept = refusesPhysicalObjects(concept)
    ? {
        ...concept,
        signature_images: replaceForbiddenPhysicalMetaphor(concept.signature_images, signature),
        creative_system: replaceForbiddenPhysicalMetaphor(concept.creative_system, signature),
        narrative: replaceForbiddenPhysicalMetaphor(concept.narrative, signature),
        visual_system: replaceForbiddenPhysicalMetaphor(concept.visual_system, signature),
      }
    : concept;
  const normalizedVisualSystem = object(normalizedConcept.visual_system);
  next.concept = {
    ...normalizedConcept,
    visual_system: {
      ...normalizedVisualSystem,
      camera_language: temporalNarrative(normalizedVisualSystem.camera_language)
        ? "Static camera and fixed composition; no movement, transformation or temporal evolution."
        : normalizedVisualSystem.camera_language,
      lighting_language: finalStateLighting(normalizedVisualSystem.lighting_language),
      production_approach: temporalNarrative(normalizedVisualSystem.production_approach)
        ? `Static generated ${signature} composition; all visual relationships are resolved in one final frame.`
        : normalizedVisualSystem.production_approach,
      editing_language: "N/A — single still composition with no cuts, transitions, animation or temporal progression.",
    },
    production_approach: temporalNarrative(normalizedConcept.production_approach)
      ? `Static generated ${signature} composition; all visual relationships are resolved in one final frame.`
      : normalizedConcept.production_approach,
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
