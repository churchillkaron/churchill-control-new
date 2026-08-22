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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function maximum(value, floor) {
  return Math.max(finite(value, floor), floor);
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
      version: "AVANTIQO_CREATIVE_QUALITY_WORLD_CLASS_V2",
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
      version: "AVANTIQO_SEMANTIC_QUALITY_WORLD_CLASS_V2",
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
      weakest_link_quality_gate: true,
      synthetic_artifact_tolerance: "ZERO_VISIBLE",
      generated_text_strategy: "DETERMINISTIC_POST_ONLY",
    },
    resolver_version: "CREATIVE_QUALITY_POLICY_RESOLVER_WORLD_CLASS_V2",
    world_class_quality: {
      contract: "AVANTIQO_WORLD_CLASS_QUALITY_V2",
      minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      minimum_confidence: WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
      weakest_link_enforced: true,
      b_grade_release_forbidden: true,
      agency_grade_release_required: true,
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

    const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []).map((node) => {
      if (String(node?.type || "").toUpperCase() !== "GENERATED_MEDIA_PERCEPTUAL_REVIEW") {
        return node;
      }

      hardenedReviewCount += 1;
      const requirements = object(node.requirements);
      const expected = object(requirements.expected_contract);
      const thresholds = hardenGeneratedMediaThresholds({
        ...object(expected.thresholds),
        ...object(requirements.thresholds),
      });

      return {
        ...node,
        requirements: {
          ...requirements,
          thresholds,
          expected_contract: {
            ...expected,
            thresholds,
            quality_standard: "WORLD_CLASS_AGENCY_GRADE",
            synthetic_artifact_tolerance: "ZERO_VISIBLE",
            weakest_link_quality_gate: true,
          },
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
          },
        },
        metadata: {
          ...object(node.metadata),
          world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V2",
          minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
          synthetic_artifact_tolerance: "ZERO_VISIBLE",
        },
      };
    });

    return {
      ...graph,
      nodes,
      metadata: {
        ...object(graph.metadata),
        world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V2",
        world_class_generated_media_review_count: hardenedReviewCount,
        minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
        weakest_link_quality_gate: true,
        b_grade_release_forbidden: true,
        agency_grade_release_required: true,
        synthetic_artifact_tolerance: "ZERO_VISIBLE",
      },
    };
  };
}

installPolicyHardening();
installGeneratedMediaHardening();

export const CreativeWorldClassQualityBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CLASS_QUALITY_V2",
  floors: WORLD_CLASS_QUALITY_FLOORS,
});
