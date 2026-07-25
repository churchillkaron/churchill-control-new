function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScore(value) {
  const number = finite(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, number));
}

function directCost(candidate = {}) {
  const values = [
    candidate.customer_price,
    candidate.cost_per_unit,
    candidate.output_cost,
    candidate.input_cost,
  ]
    .map(finite)
    .filter((value) => value !== null && value >= 0);

  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

function relativeCostScores(candidates = []) {
  const priced = candidates
    .map((candidate) => ({ candidate, cost: directCost(candidate) }))
    .filter((entry) => entry.cost !== null);

  if (!priced.length) return new Map();

  const minimum = Math.min(...priced.map((entry) => entry.cost));
  const maximum = Math.max(...priced.map((entry) => entry.cost));
  const range = maximum - minimum;

  return new Map(
    priced.map(({ candidate, cost }) => [
      candidate,
      range === 0 ? 100 : 100 - ((cost - minimum) / range) * 100,
    ]),
  );
}

function weightedAverage(signals = {}, weights = {}) {
  const active = Object.entries(signals)
    .filter(([, value]) => value !== null && Number.isFinite(value));

  if (!active.length) return null;

  const configured = active.some(
    ([name]) => finite(weights?.[name]) !== null && Number(weights[name]) > 0,
  );

  let total = 0;
  let totalWeight = 0;

  for (const [name, value] of active) {
    const weight = configured
      ? Math.max(0, Number(weights?.[name]) || 0)
      : 1;

    if (!weight) continue;
    total += value * weight;
    totalWeight += weight;
  }

  return totalWeight ? total / totalWeight : null;
}

function preferenceScore(candidate = {}, policy = {}) {
  const preferredProviders = Array.isArray(policy.preferred_providers)
    ? policy.preferred_providers
    : Array.isArray(policy.preferredProviders)
      ? policy.preferredProviders
      : [];
  const preferredModels = Array.isArray(policy.preferred_models)
    ? policy.preferred_models
    : Array.isArray(policy.preferredModels)
      ? policy.preferredModels
      : [];

  if (!preferredProviders.length && !preferredModels.length) return null;

  const providerMatch = preferredProviders.length
    ? preferredProviders.indexOf(candidate.provider)
    : -1;
  const modelMatch = preferredModels.length
    ? preferredModels.indexOf(candidate.model)
    : -1;

  const providerScore = providerMatch >= 0
    ? 100 - (providerMatch / Math.max(1, preferredProviders.length)) * 100
    : null;
  const modelScore = modelMatch >= 0
    ? 100 - (modelMatch / Math.max(1, preferredModels.length)) * 100
    : null;

  const available = [providerScore, modelScore].filter((value) => value !== null);
  if (!available.length) return 0;
  return available.reduce((total, value) => total + value, 0) / available.length;
}

export function rankProviders(candidates = [], policy = {}) {
  const costScores = relativeCostScores(candidates);
  const weights = policy.weights || policy.selection_weights || {};

  return candidates
    .map((candidate) => {
      const signals = {
        quality: clampScore(
          candidate.quality_score ??
          candidate.metadata?.quality_score,
        ),
        speed: clampScore(
          candidate.speed_score ??
          candidate.metadata?.speed_score,
        ),
        reliability: clampScore(
          candidate.reliability_score ??
          candidate.metadata?.reliability_score,
        ),
        cost: costScores.get(candidate) ?? null,
        preference: preferenceScore(candidate, policy),
      };

      return {
        ...candidate,
        intelligence_score: weightedAverage(signals, weights),
        selection_evidence: signals,
      };
    })
    .sort((left, right) => {
      const leftScore = left.intelligence_score;
      const rightScore = right.intelligence_score;

      if (leftScore === null && rightScore !== null) return 1;
      if (rightScore === null && leftScore !== null) return -1;
      if (leftScore !== rightScore) return (rightScore ?? 0) - (leftScore ?? 0);

      return [left.provider, left.model]
        .map((value) => String(value || ""))
        .join(":")
        .localeCompare(
          [right.provider, right.model]
            .map((value) => String(value || ""))
            .join(":"),
        );
    });
}

export function selectBestProvider(candidates = [], policy = {}) {
  return rankProviders(candidates, policy)[0] || null;
}
