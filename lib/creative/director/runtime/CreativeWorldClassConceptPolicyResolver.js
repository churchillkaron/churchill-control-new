import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "./CreativeWorldClassConceptPolicy";

const RESOLUTION_CONTRACT = "AVANTIQO_WORLD_CLASS_CONCEPT_POLICY_RESOLUTION_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function policyFrom(value = {}) {
  const source = object(value);
  return object(
    source.creative_intelligence_policy ||
    source.metadata?.creative_intelligence_policy,
  );
}

function policySources(input = {}) {
  return [
    policyFrom(input.organization),
    policyFrom(input.company),
    object(input.creative_intelligence_policy),
    policyFrom(input.project),
    policyFrom(input.brief),
  ].filter((source) => Object.keys(source).length);
}

function legacyRoundCaps(input = {}) {
  return [
    input.organization?.metadata?.concept_regeneration_max_rounds,
    input.company?.metadata?.concept_regeneration_max_rounds,
    input.concept_regeneration_max_rounds,
    input.project?.metadata?.concept_regeneration_max_rounds,
    input.brief?.metadata?.concept_regeneration_max_rounds,
  ];
}

function mergeSources(sources = []) {
  return sources.reduce(
    (current, source) => ({
      ...current,
      ...source,
      critic_minimums: {
        ...object(current.critic_minimums),
        ...object(source.critic_minimums),
      },
      regeneration: {
        ...object(current.regeneration),
        ...object(source.regeneration),
      },
    }),
    {
      ...WORLD_CLASS_CONCEPT_POLICY,
      critic_minimums: {
        ...WORLD_CLASS_CONCEPT_POLICY.critic_minimums,
      },
      regeneration: {
        ...WORLD_CLASS_CONCEPT_POLICY.regeneration,
      },
    },
  );
}

function stricterMinimum(sources, key, floor) {
  return Math.max(
    floor,
    ...sources
      .map((source) => finite(source[key]))
      .filter((value) => value !== null),
  );
}

function stricterCountMinimum(sources, key, floor) {
  return Math.max(
    floor,
    ...sources
      .map((source) => finite(source[key]))
      .filter((value) => value !== null)
      .map((value) => Math.ceil(value)),
  );
}

function stricterMaximum(sources, key, ceiling) {
  const values = sources
    .map((source) => finite(source[key]))
    .filter((value) => value !== null)
    .map((value) => clamp(value, 0, 1));
  return values.length ? Math.min(ceiling, ...values) : ceiling;
}

function stricterCriticMinimums(sources = []) {
  return Object.fromEntries(
    Object.entries(WORLD_CLASS_CONCEPT_POLICY.critic_minimums).map(
      ([criticId, floor]) => [
        criticId,
        Math.max(
          floor,
          ...sources
            .map((source) => finite(object(source.critic_minimums)[criticId]))
            .filter((value) => value !== null),
        ),
      ],
    ),
  );
}

function regenerationPolicy(input, sources = [], merged = {}) {
  const baseline = WORLD_CLASS_CONCEPT_POLICY.regeneration;
  const regenerationSources = sources.map((source) => object(source.regeneration));
  const configuredRoundCaps = [
    ...regenerationSources.map((source) => finite(source.max_rounds)),
    ...legacyRoundCaps(input).map(finite),
  ]
    .filter((value) => value !== null)
    .map((value) => clamp(Math.floor(value), 1, baseline.hard_max_rounds));
  const maxRounds = configuredRoundCaps.length
    ? Math.min(...configuredRoundCaps)
    : baseline.default_max_rounds;
  const similarityValues = regenerationSources
    .map((source) => finite(source.maximum_cross_round_similarity))
    .filter((value) => value !== null)
    .map((value) => clamp(value, 0, 1));

  return {
    ...object(merged.regeneration),
    contract: baseline.contract,
    default_max_rounds: baseline.default_max_rounds,
    hard_max_rounds: baseline.hard_max_rounds,
    max_rounds: maxRounds,
    maximum_cross_round_similarity: similarityValues.length
      ? Math.min(baseline.maximum_cross_round_similarity, ...similarityValues)
      : baseline.maximum_cross_round_similarity,
    persisted_failure_history_limit: baseline.persisted_failure_history_limit,
    provider_execution: baseline.provider_execution,
    stop_on_a_grade: true,
    fail_closed_when_exhausted: true,
  };
}

export function resolveWorldClassConceptPolicy(input = {}) {
  const sources = policySources(input);
  const merged = mergeSources(sources);
  const baseline = WORLD_CLASS_CONCEPT_POLICY;

  return Object.freeze({
    ...merged,
    contract: baseline.contract,
    minimum_weighted_score: stricterMinimum(
      sources,
      "minimum_weighted_score",
      baseline.minimum_weighted_score,
    ),
    minimum_selector_confidence: stricterMinimum(
      sources,
      "minimum_selector_confidence",
      baseline.minimum_selector_confidence,
    ),
    maximum_pairwise_similarity: stricterMaximum(
      sources,
      "maximum_pairwise_similarity",
      baseline.maximum_pairwise_similarity,
    ),
    critic_minimums: Object.freeze(stricterCriticMinimums(sources)),
    minimum_signature_images: stricterCountMinimum(
      sources,
      "minimum_signature_images",
      baseline.minimum_signature_images,
    ),
    minimum_campaign_extensions: stricterCountMinimum(
      sources,
      "minimum_campaign_extensions",
      baseline.minimum_campaign_extensions,
    ),
    minimum_anti_cliche_rules: stricterCountMinimum(
      sources,
      "minimum_anti_cliche_rules",
      baseline.minimum_anti_cliche_rules,
    ),
    generic_swap_test_required: true,
    evidence_specificity_required: true,
    ownable_mechanism_required: true,
    earned_surprise_required: true,
    medium_native_idea_required: true,
    b_grade_concept_forbidden: true,
    regeneration: Object.freeze(regenerationPolicy(input, sources, merged)),
    policy_resolution: Object.freeze({
      contract: RESOLUTION_CONTRACT,
      strategy: "STRICTEST_STANDARD_WINS",
      global_minimums_cannot_be_lowered: true,
      lower_similarity_is_stricter: true,
      regeneration_rounds_are_cost_governance: true,
      provider_execution_boundary_fixed: true,
    }),
  });
}

export function applyWorldClassConceptPolicy(input = {}) {
  const policy = resolveWorldClassConceptPolicy(input);
  const project = object(input.project);
  const brief = object(input.brief);

  return {
    input: {
      ...input,
      creative_intelligence_policy: policy,
      project: {
        ...project,
        metadata: {
          ...object(project.metadata),
          creative_intelligence_policy: policy,
        },
      },
      brief: {
        ...brief,
        metadata: {
          ...object(brief.metadata),
          creative_intelligence_policy: policy,
        },
      },
    },
    policy,
  };
}

export const CreativeWorldClassConceptPolicyResolver = Object.freeze({
  contract: RESOLUTION_CONTRACT,
  resolve: resolveWorldClassConceptPolicy,
  apply: applyWorldClassConceptPolicy,
});
