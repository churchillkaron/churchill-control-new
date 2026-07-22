function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  ) ?? null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function policyFrom(value = {}) {
  const source = object(
    value.creative_policy ||
    value.creativePolicy ||
    value.direction_policy ||
    value.directionPolicy ||
    value,
  );

  return {
    mode: first(source.mode, source.creative_mode),
    ambition: first(source.ambition, source.quality_ambition),
    risk_appetite: first(source.risk_appetite, source.riskAppetite),
    novelty_target: first(source.novelty_target, source.noveltyTarget),
    interpretation_scope: first(
      source.interpretation_scope,
      source.interpretationScope,
    ),
    allow_exploration: source.allow_exploration ?? source.allowExploration,
    allow_surprise: source.allow_surprise ?? source.allowSurprise,
    allow_humor: source.allow_humor ?? source.allowHumor,
    require_alternatives:
      source.require_alternatives ?? source.requireAlternatives,
    preserve: list(
      source.preserve ||
      source.factual_invariants ||
      source.factualInvariants,
    ),
    may_change: list(
      source.may_change ||
      source.mayChange ||
      source.creative_freedom,
    ),
    restrictions: list(
      source.restrictions ||
      source.constraints ||
      source.non_negotiables,
    ),
    preferences: object(source.preferences),
    structure: object(source.structure),
    provider_controls: object(
      source.provider_controls || source.providerControls,
    ),
  };
}

export function resolveCreativeFreedomPolicy(...sources) {
  const policies = sources
    .flat()
    .filter(Boolean)
    .map(policyFrom);

  return {
    mode: first(...policies.map((policy) => policy.mode)),
    ambition: first(...policies.map((policy) => policy.ambition)),
    risk_appetite: first(
      ...policies.map((policy) => policy.risk_appetite),
    ),
    novelty_target: first(
      ...policies.map((policy) => policy.novelty_target),
    ),
    interpretation_scope: first(
      ...policies.map((policy) => policy.interpretation_scope),
    ),
    allow_exploration: first(
      ...policies.map((policy) => policy.allow_exploration),
    ),
    allow_surprise: first(
      ...policies.map((policy) => policy.allow_surprise),
    ),
    allow_humor: first(
      ...policies.map((policy) => policy.allow_humor),
    ),
    require_alternatives: first(
      ...policies.map((policy) => policy.require_alternatives),
    ),
    preserve: unique(policies.flatMap((policy) => policy.preserve)),
    may_change: unique(policies.flatMap((policy) => policy.may_change)),
    restrictions: unique(
      policies.flatMap((policy) => policy.restrictions),
    ),
    preferences: Object.assign(
      {},
      ...policies.map((policy) => policy.preferences),
    ),
    structure: Object.assign(
      {},
      ...policies.map((policy) => policy.structure),
    ),
    provider_controls: Object.assign(
      {},
      ...policies.map((policy) => policy.provider_controls),
    ),
    policy_source_count: policies.length,
    unspecified_fields_are_open: true,
  };
}

export const CreativeFreedomPolicyRuntime = {
  resolve: resolveCreativeFreedomPolicy,
};
