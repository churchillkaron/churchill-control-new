import {
  CreativeQualityPolicyResolverRuntime,
} from "./CreativeQualityPolicyResolverRuntime";
import {
  CreativeGeneratedMediaPerceptualGraphRuntime,
} from "./CreativeGeneratedMediaPerceptualGraphRuntime";

const POLICY_FLAG = Symbol.for(
  "avantiqo.creative.world-class-quality-policy.v1",
);
const GRAPH_FLAG = Symbol.for(
  "avantiqo.creative.world-class-generated-media.v1",
);

export const WORLD_CLASS_QUALITY_FLOORS = Object.freeze({
  minimum_release_score: 95,
  minimum_confidence: 88,
  minimum_scene_score: 95,
  regenerate_below_score: 94,
  semantic_checks: Object.freeze({
    identity_continuity: 98,
    product_continuity: 98,
    anatomy_and_object_integrity: 97,
    physics_and_contact: 96,
    reflections_shadows_and_object_permanence: 96,
    camera_plausibility: 96,
    motion_cadence: 96,
    performance_authenticity: 96,
    lip_synchronisation: 97,
    production_design_coherence: 96,
    environmental_coherence: 96,
    generated_text_integrity: 99,
    exposure_colour_and_texture: 95,
    compression_consistency: 95,
    pacing_and_transitions: 95,
    brand_truth_and_claims: 98,
    repetitive_model_signatures: 98,
    detectable_synthetic_artifacts: 98,
  }),
  generated_media: Object.freeze({
    minimum_overall_score: 95,
    minimum_story_score: 94,
    minimum_environment_score: 96,
    minimum_camera_score: 96,
    minimum_anatomy_score: 97,
    minimum_identity_score: 98,
    minimum_product_fidelity_score: 98,
    minimum_music_energy_score: 92,
    minimum_performance_score: 96,
    minimum_continuity_score: 96,
    minimum_physics_score: 96,
    minimum_artifact_score: 98,
  }),
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function maximum(value, floor) {
  return Math.max(finite(value, floor), floor);
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function hardenGeneratedMediaThresholds(value = {}) {
  const current = object(value);
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(WORLD_CLASS_QUALITY_FLOORS.generated_media).map(
        ([key, floor]) => [key, maximum(current[key], floor)],
      ),
    ),
  };
}

function hardenSemanticCheckScores(value = {}) {
  const current = object(value);
  return Object.fromEntries(
    Object.entries(WORLD_CLASS_QUALITY_FLOORS.semantic_checks).map(
      ([key, floor]) => [key, maximum(current[key], floor)],
    ),
  );
}

function referenceAssetIds(expected = {}) {
  const identity = object(expected.identity_requirements);
  return unique([
    expected.reference_asset_id,
    expected.reference_asset_ids,
    expected.primary_source_asset_id,
    identity.reference_asset_id,
    identity.reference_asset_ids,
  ]);
}

function referenceFidelityContract(expected = {}) {
  const references = referenceAssetIds(expected);
  const required = Boolean(
    references.length > 0 ||
    expected.source_locked === true ||
    text(expected.primary_source_asset_id),
  );
  if (!required) return null;

  const categories = [
    expected.person_expected === true || expected.identity_expected === true
      ? "PERSON_IDENTITY"
      : null,
    expected.product_expected === true || list(expected.products).length > 0
      ? "PRODUCT_OR_DISH"
      : null,
    Object.keys(object(expected.production_design)).length > 0 || expected.source_locked === true
      ? "VENUE_ENVIRONMENT_AND_OBJECT_GEOMETRY"
      : null,
    "REFERENCE_BOUND_MEDIA",
  ].filter(Boolean);

  return {
    contract: "CREATIVE_ORIGINAL_VS_GENERATED_REFERENCE_FIDELITY_V1",
    required: true,
    comparison_basis: "APPROVED_ORIGINAL_REFERENCE_PIXELS_VS_GENERATED_OUTPUT_PIXELS",
    reference_asset_ids: references,
    categories: [...new Set(categories)],
    minimum_fidelity_score: 98,
    weakest_link_enforced: true,
    approximation_is_failure: true,
    attractive_but_inaccurate_is_failure: true,
    preserve_dimensions: {
      person_identity: [
        "facial_geometry",
        "eye_spacing",
        "nose_lips_jaw",
        "skin_tone_age_hairline",
        "body_type_and_proportions",
      ],
      food_and_dish: [
        "dish_identity",
        "ingredient_and_garnish_presence",
        "portion_and_count",
        "cooking_state_and_texture",
        "sauce_type_colour_and_placement",
        "side_dishes_and_accompaniments",
        "plating_layout",
        "plate_bowl_glass_and_tableware",
        "food_colour_and_surface_texture",
      ],
      product_and_equipment: [
        "shape_and_proportions",
        "materials_and_surface_finish",
        "colour",
        "component_count_and_placement",
        "controls_screens_labels_and_markings",
        "logos_and_brand_marks",
      ],
      venue_and_environment: [
        "architecture_and_room_geometry",
        "walls_floor_ceiling_and_fixed_finishes",
        "doors_windows_and_openings",
        "fixed_fixtures_and_furniture",
        "game_equipment_geometry_and_orientation",
        "lighting_identity_and_practical_fixture_locations",
        "signage_and_brand_placement",
        "spatial_relationships_and_scale",
      ],
      image_truth: [
        "subject_count",
        "object_permanence",
        "material_truth",
        "colour_relationships",
        "locked_composition_when_required",
        "no_invented_text_or_logo",
      ],
      temporal_truth: [
        "identity_stability_across_frames",
        "geometry_stability_across_frames",
        "texture_stability_across_frames",
        "physically_plausible_motion",
        "no_morphing_between_reference_bound_objects",
      ],
    },
    failure_modes: [
      "LOOKALIKE_OR_GENERIC_REPLACEMENT",
      "REFERENCE_GEOMETRY_DRIFT",
      "PLATING_OR_PORTION_DRIFT",
      "INGREDIENT_GARNISH_SAUCE_OR_SIDE_DRIFT",
      "TABLEWARE_OR_PACKAGING_DRIFT",
      "VENUE_ARCHITECTURE_OR_FIXTURE_DRIFT",
      "EQUIPMENT_SHAPE_OR_ORIENTATION_DRIFT",
      "BRAND_MARK_TEXT_OR_LABEL_DRIFT",
      "COLOUR_MATERIAL_OR_TEXTURE_DRIFT",
      "TEMPORAL_REFERENCE_DRIFT",
    ],
    release_rule: "ANY_MATERIAL_REFERENCE_DRIFT_BLOCKS_EDITING_AND_RELEASE",
  };
}

function applyReferenceFidelity(expected = {}, thresholds = {}) {
  const referenceFidelity = referenceFidelityContract(expected);
  if (!referenceFidelity) {
    return { expected, thresholds, required: false };
  }

  const hardenedThresholds = {
    ...thresholds,
    minimum_product_fidelity_score: maximum(
      thresholds.minimum_product_fidelity_score,
      referenceFidelity.minimum_fidelity_score,
    ),
  };

  return {
    required: true,
    thresholds: hardenedThresholds,
    expected: {
      ...expected,
      thresholds: hardenedThresholds,
      product_expected: true,
      product_requirements: {
        ...object(expected.product_requirements),
        universal_reference_fidelity_required: true,
        reference_fidelity_contract: referenceFidelity,
      },
      reference_fidelity: referenceFidelity,
      original_vs_generated_comparison_required: true,
      reference_drift_rejects_output: true,
    },
  };
}

function hardenResolvedPolicy(result = {}) {
  const creative = object(result.creative_quality_policy);
  const semantic = object(result.semantic_quality_policy);
  const minimumSceneScore = maximum(
    creative.minimum_scene_score,
    WORLD_CLASS_QUALITY_FLOORS.minimum_scene_score,
  );
  const regenerateBelowScore = Math.min(
    minimumSceneScore,
    maximum(
      creative.regenerate_below_score,
      WORLD_CLASS_QUALITY_FLOORS.regenerate_below_score,
    ),
  );

  return {
    ...result,
    profile_id: `${result.profile_id || "UNIVERSAL_CREATIVE_PREMIUM"}_WORLD_CLASS`,
    creative_quality_policy: {
      ...creative,
      version: "AVANTIQO_CREATIVE_QUALITY_WORLD_CLASS_V3",
      minimum_scene_score: minimumSceneScore,
      regenerate_below_score: regenerateBelowScore,
      minimum_release_score: maximum(
        creative.minimum_release_score,
        WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      ),
      require_brand_fit: true,
      require_non_ai_feel: true,
      require_identity_continuity: true,
      require_product_continuity: true,
      require_original_vs_generated_reference_fidelity: true,
      agency_grade_release_required: true,
      synthetic_artifact_tolerance: "ZERO_VISIBLE",
      generated_text_strategy: "DETERMINISTIC_POST_ONLY",
      transition_strategy: "EDITORIAL_FIRST_NO_VISIBLE_MORPH_UNLESS_JUSTIFIED",
      camera_motion_policy: "PHYSICALLY_PLAUSIBLE_RESTRAINED",
      weakest_link_quality_gate: true,
      b_grade_release_forbidden: true,
    },
    semantic_quality_policy: {
      ...semantic,
      version: "AVANTIQO_SEMANTIC_QUALITY_WORLD_CLASS_V3",
      minimum_score: maximum(
        semantic.minimum_score,
        WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      ),
      minimum_confidence: maximum(
        semantic.minimum_confidence,
        WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
      ),
      check_minimum_scores: hardenSemanticCheckScores(
        semantic.check_minimum_scores,
      ),
      sample_frame_count: maximum(semantic.sample_frame_count, 12),
      forensic_temporal_review_required: true,
      dense_temporal_window_count: maximum(
        semantic.dense_temporal_window_count,
        3,
      ),
      dense_temporal_window_seconds: maximum(
        semantic.dense_temporal_window_seconds,
        0.6,
      ),
      dense_temporal_frame_count: maximum(
        semantic.dense_temporal_frame_count,
        4,
      ),
      require_timestamped_failures: true,
      require_original_vs_generated_reference_fidelity: true,
      weakest_link_quality_gate: true,
      synthetic_artifact_tolerance: "ZERO_VISIBLE",
      generated_text_strategy: "DETERMINISTIC_POST_ONLY",
    },
    resolver_version: "CREATIVE_QUALITY_POLICY_RESOLVER_WORLD_CLASS_V3",
    world_class_quality: {
      contract: "AVANTIQO_WORLD_CLASS_QUALITY_V3",
      minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      minimum_confidence: WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
      weakest_link_enforced: true,
      b_grade_release_forbidden: true,
      agency_grade_release_required: true,
      original_vs_generated_reference_fidelity_required: true,
      synthetic_artifact_tolerance: "ZERO_VISIBLE",
      temporal_forensic_review_required: true,
    },
  };
}

function installPolicyHardening() {
  if (CreativeQualityPolicyResolverRuntime[POLICY_FLAG]) return;

  const resolve = CreativeQualityPolicyResolverRuntime.resolve.bind(
    CreativeQualityPolicyResolverRuntime,
  );

  Object.defineProperty(CreativeQualityPolicyResolverRuntime, POLICY_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeQualityPolicyResolverRuntime.resolve = function resolveWorldClassPolicy(input = {}) {
    return hardenResolvedPolicy(resolve(input));
  };
}

function installGeneratedMediaHardening() {
  if (CreativeGeneratedMediaPerceptualGraphRuntime[GRAPH_FLAG]) return;

  const apply = CreativeGeneratedMediaPerceptualGraphRuntime.apply.bind(
    CreativeGeneratedMediaPerceptualGraphRuntime,
  );

  Object.defineProperty(CreativeGeneratedMediaPerceptualGraphRuntime, GRAPH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeGeneratedMediaPerceptualGraphRuntime.apply = function applyWorldClassGeneratedMedia(input = {}) {
    const graph = apply(input);
    let hardenedReviewCount = 0;
    let referenceFidelityReviewCount = 0;

    const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []).map((node) => {
      if (String(node?.type || "").toUpperCase() !== "GENERATED_MEDIA_PERCEPTUAL_REVIEW") {
        return node;
      }

      hardenedReviewCount += 1;
      const requirements = object(node.requirements);
      const expected = object(requirements.expected_contract);
      const baseThresholds = hardenGeneratedMediaThresholds({
        ...object(expected.thresholds),
        ...object(requirements.thresholds),
      });
      const reference = applyReferenceFidelity(expected, baseThresholds);
      if (reference.required) referenceFidelityReviewCount += 1;
      const thresholds = reference.thresholds;
      const hardenedExpected = reference.expected;

      return {
        ...node,
        requirements: {
          ...requirements,
          thresholds,
          expected_contract: {
            ...hardenedExpected,
            thresholds,
            quality_standard: "WORLD_CLASS_AGENCY_GRADE",
            synthetic_artifact_tolerance: "ZERO_VISIBLE",
            weakest_link_quality_gate: true,
          },
          compare_all_original_references: reference.required,
          original_vs_generated_comparison_required: reference.required,
          reject_reference_drift_before_editing: reference.required,
          weakest_link_quality_gate: true,
          b_grade_release_forbidden: true,
          forensic_temporal_review_required: true,
        },
        generation: {
          ...object(node.generation),
          provider_parameters: {
            ...object(node.generation?.provider_parameters),
            thresholds,
            quality_standard: "WORLD_CLASS_AGENCY_GRADE",
            original_vs_generated_comparison_required: reference.required,
            reference_fidelity_contract:
              hardenedExpected.reference_fidelity || null,
          },
        },
        metadata: {
          ...object(node.metadata),
          world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V3",
          minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
          original_vs_generated_comparison_required: reference.required,
          reference_fidelity_contract:
            hardenedExpected.reference_fidelity?.contract || null,
          synthetic_artifact_tolerance: "ZERO_VISIBLE",
        },
      };
    });

    return {
      ...graph,
      nodes,
      metadata: {
        ...object(graph.metadata),
        world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V3",
        world_class_generated_media_review_count: hardenedReviewCount,
        original_vs_generated_reference_fidelity_review_count:
          referenceFidelityReviewCount,
        minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
        weakest_link_quality_gate: true,
        b_grade_release_forbidden: true,
        agency_grade_release_required: true,
        original_vs_generated_reference_fidelity_required: true,
        synthetic_artifact_tolerance: "ZERO_VISIBLE",
      },
    };
  };
}

installPolicyHardening();
installGeneratedMediaHardening();

export const CreativeWorldClassQualityBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CLASS_QUALITY_V3",
  reference_fidelity_contract:
    "CREATIVE_ORIGINAL_VS_GENERATED_REFERENCE_FIDELITY_V1",
  floors: WORLD_CLASS_QUALITY_FLOORS,
});
