const CAPABILITIES = Object.freeze({
  "creative.design.compose": Object.freeze({
    id: "creative.design.compose",
    name: "Design Composition",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "STRUCTURED_DESIGN_DOCUMENT",
  }),
  "creative.design.data.bind": Object.freeze({
    id: "creative.design.data.bind",
    name: "Governed Design Data Binding",
    execution: "DETERMINISTIC_FAIL_CLOSED",
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
  "creative.design.repair": Object.freeze({
    id: "creative.design.repair",
    name: "Bounded Design Repair",
    execution: "DETERMINISTIC_REPAIR_LOOP",
    user_facing: false,
    provider_required: false,
    produces: "STRUCTURED_DESIGN_DOCUMENT",
  }),
  "creative.design.layout.table": Object.freeze({
    id: "creative.design.layout.table",
    name: "Structured Table Layout",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "STRUCTURED_TABLE_LAYOUT",
  }),
  "creative.design.print.validate": Object.freeze({
    id: "creative.design.print.validate",
    name: "Print Profile Validation",
    execution: "DETERMINISTIC_FAIL_CLOSED",
    user_facing: false,
    provider_required: false,
    produces: "PRINT_PROFILE_REPORT",
  }),
  "creative.design.render.svg": Object.freeze({
    id: "creative.design.render.svg",
    name: "SVG Design Render",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "SVG",
  }),
  "creative.design.render.png": Object.freeze({
    id: "creative.design.render.png",
    name: "PNG Design Render",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "PNG",
  }),
  "creative.design.render.pdf": Object.freeze({
    id: "creative.design.render.pdf",
    name: "PDF Design Render",
    execution: "DETERMINISTIC",
    user_facing: false,
    provider_required: false,
    produces: "PDF",
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
  vector_master_preserved: true,
  governed_business_data_only: true,
  bounded_repair_preserves_locked_nodes: true,
  repair_business_truth_mutation_forbidden: true,
  cmyk_and_pdfx_fail_closed_until_certified: true,
});
