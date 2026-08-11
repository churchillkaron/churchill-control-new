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
  minimum_release_score: 94,
  minimum_confidence: 85,
  minimum_scene_score: 94,
  regenerate_below_score: 93,
  generated_media: Object.freeze({
    minimum_overall_score: 94,
    minimum_story_score: 92,
    minimum_environment_score: 92,
    minimum_camera_score: 90,
    minimum_anatomy_score: 94,
    minimum_identity_score: 96,
    minimum_product_fidelity_score: 96,
    minimum_music_energy_score: 90,
    minimum_performance_score: 92,
    minimum_continuity_score: 92,
    minimum_physics_score: 90,
    minimum_artifact_score: 96,
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
      version: "AVANTIQO_CREATIVE_QUALITY_WORLD_CLASS_V1",
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
    },
    semantic_quality_policy: {
      ...semantic,
      version: "AVANTIQO_SEMANTIC_QUALITY_WORLD_CLASS_V1",
      minimum_score: maximum(
        semantic.minimum_score,
        WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      ),
      minimum_confidence: maximum(
        semantic.minimum_confidence,
        WORLD_CLASS_QUALITY_FLOORS.minimum_confidence,
      ),
    },
    resolver_version: "CREATIVE_QUALITY_POLICY_RESOLVER_WORLD_CLASS_V1",
    world_class_quality: {
      contract: "AVANTIQO_WORLD_CLASS_QUALITY_V1",
      minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
      weakest_link_enforced: true,
      b_grade_release_forbidden: true,
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
            quality_standard: "WORLD_CLASS",
          },
          weakest_link_quality_gate: true,
          b_grade_release_forbidden: true,
        },
        generation: {
          ...object(node.generation),
          provider_parameters: {
            ...object(node.generation?.provider_parameters),
            thresholds,
            quality_standard: "WORLD_CLASS",
          },
        },
        metadata: {
          ...object(node.metadata),
          world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V1",
          minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
        },
      };
    });

    return {
      ...graph,
      nodes,
      metadata: {
        ...object(graph.metadata),
        world_class_quality_contract: "AVANTIQO_WORLD_CLASS_QUALITY_V1",
        world_class_generated_media_review_count: hardenedReviewCount,
        minimum_release_score: WORLD_CLASS_QUALITY_FLOORS.minimum_release_score,
        weakest_link_quality_gate: true,
        b_grade_release_forbidden: true,
      },
    };
  };
}

installPolicyHardening();
installGeneratedMediaHardening();

export const CreativeWorldClassQualityBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CLASS_QUALITY_V1",
  floors: WORLD_CLASS_QUALITY_FLOORS,
});
