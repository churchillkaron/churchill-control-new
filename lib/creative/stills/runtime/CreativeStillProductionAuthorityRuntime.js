import crypto from "node:crypto";

import {
  verifyCreativeStillPrevisualizationBlueprint,
} from "./CreativeStillPrevisualizationRuntime.js";

const CONTRACT = "CREATIVE_STILL_PRODUCTION_AUTHORITY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assetIds(values = []) {
  return [...new Set(list(values).map((value) => text(
    typeof value === "string" || typeof value === "number"
      ? value
      : value?.asset_id || value?.id,
  )).filter(Boolean))];
}

export function buildCreativeStillProductionAuthority({
  previsualization = {},
  requirements = {},
  direct_assets = [],
  reference_assets = [],
  capability = null,
  deliverable = {},
} = {}) {
  const req = object(requirements);
  const expected = object(req.expected_contract);
  const deterministic = object(previsualization?.payload?.deterministic_layers);
  const failures = [];

  if (!verifyCreativeStillPrevisualizationBlueprint(previsualization)) {
    failures.push("STILL_AUTHORITY_PREVISUALIZATION_INVALID");
  }
  if (deterministic.typography !== true || deterministic.copy !== true) {
    failures.push("STILL_AUTHORITY_DETERMINISTIC_TYPOGRAPHY_REQUIRED");
  }
  if (deterministic.generated_text_pixels_forbidden !== true) {
    failures.push("STILL_AUTHORITY_GENERATED_TEXT_PIXELS_FORBIDDEN");
  }
  if (deterministic.generated_logo_pixels_forbidden !== true) {
    failures.push("STILL_AUTHORITY_GENERATED_LOGO_PIXELS_FORBIDDEN");
  }

  const references = assetIds(reference_assets);
  const direct = assetIds(direct_assets);
  const referenceObligations = {
    identity: expected.identity_expected === true,
    product: expected.product_expected === true,
    brand: expected.brand_expected === true,
    location: expected.location_expected === true,
    style: expected.style_memory_required === true,
  };
  const referenceRequired = Object.values(referenceObligations).some(Boolean);
  if (referenceRequired && references.length === 0 && direct.length === 0) {
    failures.push("STILL_AUTHORITY_REFERENCE_EVIDENCE_REQUIRED");
  }

  const payload = {
    capability: text(capability).toLowerCase() || null,
    deliverable_id: deliverable?.id || null,
    deliverable_type: deliverable?.type || null,
    previsualization_digest: text(previsualization?.blueprint_digest) || null,
    direct_asset_ids: direct,
    reference_asset_ids: references,
    reference_obligations: referenceObligations,
    exact_design: {
      deterministic_typography: true,
      deterministic_copy: true,
      deterministic_brand_assets: deterministic.logo === true,
      deterministic_business_data: deterministic.pricing_and_business_data === true,
      generated_text_pixels_forbidden: true,
      generated_logo_pixels_forbidden: true,
    },
    quality_authority: {
      world_class_required: true,
      overall_floor: 95,
      critical_visual_floor: 94,
      identity_floor: 96,
      product_fidelity_floor: 96,
      exact_copy_floor: 100,
      exact_logo_floor: 100,
      premium_graphic_benchmark_id: "PREMIUM_EDITORIAL_AUTOMOTIVE_MINIMUM_V1",
      premium_typography_floor: 97,
      premium_alignment_floor: 97,
      premium_critical_design_floor: 95,
      independent_review_required: true,
      intended_vs_rendered_dailies_required: true,
      average_score_cannot_hide_critical_failure: true,
    },
    repair_authority: {
      repair_first: true,
      bounded_repair_before_regeneration: true,
      preserve_unaffected_regions: true,
      whole_project_regeneration_forbidden: true,
      post_repair_review_required: true,
    },
    execution_boundary: {
      prompt_free: true,
      provider_prompt_user_visible: false,
      provider_selection_user_visible: false,
      provider_execution_authority: false,
      paid_generation_requires_common_studio_certification: true,
    },
  };

  const authority = {
    contract: CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    payload,
    zero_provider_calls: true,
    zero_media_generation: true,
    provider_execution_authority: false,
  };

  return Object.freeze({
    ...authority,
    authority_digest: digest(authority),
  });
}

export function verifyCreativeStillProductionAuthority(value = {}, previsualization = null) {
  const authority = object(value);
  if (authority.contract !== CONTRACT || authority.passed !== true) return false;
  if (authority.zero_provider_calls !== true || authority.zero_media_generation !== true) return false;
  if (authority.provider_execution_authority !== false) return false;
  if (!text(authority.authority_digest)) return false;
  const unsigned = { ...authority };
  delete unsigned.authority_digest;
  if (authority.authority_digest !== digest(unsigned)) return false;
  if (previsualization) {
    if (!verifyCreativeStillPrevisualizationBlueprint(previsualization)) return false;
    if (text(authority.payload?.previsualization_digest) !== text(previsualization.blueprint_digest)) return false;
  }
  return true;
}

export const CreativeStillProductionAuthorityRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativeStillProductionAuthority,
  verify: verifyCreativeStillProductionAuthority,
});

export default CreativeStillProductionAuthorityRuntime;
