const CONTRACT = "CREATIVE_STILL_REPAIR_DIRECTOR_V1";

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function unique(values) { return [...new Set(list(values).flat(Infinity).filter(Boolean))]; }

function classify(failure) {
  const value = text(failure).toUpperCase();
  if (/FONT|TYPOGRAPH|TEXT_OVERFLOW|COPY|LOGO|BRAND_ASSET|DATA_BINDING|TABLE|QR|BARCODE|COLLISION|LAYOUT/.test(value)) return "DETERMINISTIC_DESIGN_REPAIR";
  if (/DIMENSION|VARIANT|FORMAT|SAFE_ZONE|BLEED|TRIM|CROP/.test(value)) return "FORMAT_ADAPTATION_REPAIR";
  if (/ANATOM|HAND|FINGER|EYE|TEETH|LOCAL_ARTIFACT|EDGE|SEAM|SMALL_OBJECT/.test(value)) return "LOCAL_INPAINT_REPAIR";
  if (/BACKGROUND|OUTPAINT|CANVAS_EXTEND/.test(value)) return "OUTPAINT_REPAIR";
  if (/LIGHT|MATERIAL|COLOR|COLOUR|CONTRAST|SKIN|REFLECTION|REALISM/.test(value)) return "IMAGE_EDIT_REPAIR";
  if (/IDENTITY|PRODUCT_FIDELITY/.test(value)) return "REFERENCE_BOUND_EDIT_REPAIR";
  if (/COMPOSITION|DEPTH|PRODUCTION_DESIGN|VISUAL_HIERARCHY|PLACE_SPECIFICITY|SCALE_READABILITY/.test(value)) return "STRUCTURAL_IMAGE_EDIT_REPAIR";
  if (/SYNTHETIC_ARTIFACT|WATERMARK|UNEXPECTED_GENERATED_TEXT/.test(value)) return "LOCAL_INPAINT_REPAIR";
  return "SOURCE_REGENERATION_REVIEW";
}
function capabilityFor(kind) {
  return {
    DETERMINISTIC_DESIGN_REPAIR: "creative.design.repair",
    FORMAT_ADAPTATION_REPAIR: "creative.design.adapt",
    LOCAL_INPAINT_REPAIR: "ai.image.inpaint",
    OUTPAINT_REPAIR: "ai.image.outpaint",
    IMAGE_EDIT_REPAIR: "ai.image.edit",
    REFERENCE_BOUND_EDIT_REPAIR: "ai.image.edit",
    STRUCTURAL_IMAGE_EDIT_REPAIR: "ai.image.edit",
    SOURCE_REGENERATION_REVIEW: "ai.image.generate",
  }[kind];
}

function destructiveRank(kind) {
  return {
    DETERMINISTIC_DESIGN_REPAIR: 0,
    FORMAT_ADAPTATION_REPAIR: 1,
    LOCAL_INPAINT_REPAIR: 2,
    OUTPAINT_REPAIR: 3,
    IMAGE_EDIT_REPAIR: 4,
    REFERENCE_BOUND_EDIT_REPAIR: 5,
    STRUCTURAL_IMAGE_EDIT_REPAIR: 6,
    SOURCE_REGENERATION_REVIEW: 9,
  }[kind] ?? 10;
}
export function directCreativeStillRepairs({ failures = [], existing_repair_instructions = [] } = {}) {
  const groups = new Map();
  for (const failure of unique(failures)) {
    const kind = classify(failure);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(failure);
  }

  const repairs = [...groups.entries()]
    .map(([kind, groupedFailures]) => ({
      kind,
      capability: capabilityFor(kind),
      failures: groupedFailures,
      preserve: [
        "APPROVED_BRAND_ASSETS",
        "APPROVED_COPY",
        "APPROVED_BUSINESS_DATA",
        "APPROVED_SUBJECT_IDENTITY_UNLESS_IDENTITY_IS_THE_FAILURE",
        "APPROVED_COMPOSITION_UNLESS_COMPOSITION_IS_THE_FAILURE",
        "ALL_UNAFFECTED_REGIONS",
      ],
      regeneration_scope: kind === "SOURCE_REGENERATION_REVIEW"
        ? "SOURCE_ASSET_ONLY_AFTER_BOUNDED_REPAIR_IS_PROVEN_INSUFFICIENT"
        : "BOUNDED_REGION_OR_STRUCTURED_NODES_ONLY",
      provider_prompt_user_visible: false,
      requires_post_repair_review: true,
      destructive_rank: destructiveRank(kind),
    }))
    .sort((a, b) => a.destructive_rank - b.destructive_rank);

  return Object.freeze({
    contract: CONTRACT,
    prompt_free: true,
    repair_first: true,
    whole_project_regeneration_forbidden: true,
    repairs,
    original_repair_instructions: list(existing_repair_instructions),
    maximum_destructive_rank: repairs.length
      ? Math.max(...repairs.map((repair) => repair.destructive_rank))
      : null,
    source_regeneration_required: repairs.some(
      (repair) => repair.kind === "SOURCE_REGENERATION_REVIEW",
    ),
  });
}

export const CreativeStillRepairDirectorRuntime = Object.freeze({
  contract: CONTRACT,
  direct: directCreativeStillRepairs,
});

export default CreativeStillRepairDirectorRuntime;
