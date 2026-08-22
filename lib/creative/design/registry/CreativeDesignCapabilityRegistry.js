const CAPABILITIES = Object.freeze({
  "creative.design.compose": Object.freeze({
    id: "creative.design.compose",
    name: "Design Composition",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "STRUCTURED_DESIGN_DOCUMENT",
  }),
  "creative.design.validate": Object.freeze({
    id: "creative.design.validate",
    name: "Design Validation",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "DESIGN_VALIDATION_REPORT",
  }),
  "creative.design.render.svg": Object.freeze({
    id: "creative.design.render.svg",
    name: "SVG Design Render",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "SVG",
  }),
  "creative.design.adapt": Object.freeze({
    id: "creative.design.adapt",
    name: "Design Format Adaptation",
    execution: "DIRECTOR_SPECIFIED_DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "STRUCTURED_DESIGN_DOCUMENT",
  }),
});

export function getCreativeDesignCapability(id) {
  return CAPABILITIES[id] || null;
}

export function listCreativeDesignCapabilities() {
  return Object.values(CAPABILITIES);
}

export function isCreativeDesignCapability(id) {
  return Boolean(getCreativeDesignCapability(id));
}

export const CREATIVE_DESIGN_CAPABILITIES = CAPABILITIES;

export const CREATIVE_DESIGN_CAPABILITY_CONTRACT = Object.freeze({
  contract: "CREATIVE_DESIGN_CAPABILITY_REGISTRY_V1",
  provider_selection_exposed: false,
  provider_required: false,
  source_of_truth: "CREATIVE_MASTER_PLAN",
  exact_text_rendering: true,
  generative_text_pixels_forbidden: true,
});
