function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, parsed))
    : null;
}

function average(values = []) {
  const valid = values.filter((value) => value !== null);
  if (!valid.length) return 0;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

export function calculateAssetScore({
  analysis = {},
  policy = {},
} = {}) {
  const quality = analysis.quality || {};
  const signals = {
    quality: number(
      analysis.quality_score ??
      quality.overall,
    ),
    sharpness: number(quality.sharpness),
    lighting: number(quality.lighting),
    composition: number(quality.composition),
    confidence: number(
      analysis.asset_confidence ??
      analysis.confidence,
    ),
    brand: number(
      analysis.brand_alignment_score ??
      analysis.brand_relevance_score,
    ),
    relevance: number(
      analysis.relevance_score ??
      analysis.industry_relevance_score,
    ),
  };

  const enabled = Object.entries(signals)
    .filter(([name, value]) => value !== null && policy.disabledSignals?.includes(name) !== true);

  if (!enabled.length) {
    return 0;
  }

  const suppliedWeights = policy.weights || {};
  const hasWeights = enabled.some(([name]) => Number(suppliedWeights[name]) > 0);

  if (!hasWeights) {
    return average(enabled.map(([, value]) => value));
  }

  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [name, value] of enabled) {
    const weight = Math.max(0, Number(suppliedWeights[name]) || 0);
    if (!weight) continue;
    weightedTotal += value * weight;
    totalWeight += weight;
  }

  return totalWeight ? weightedTotal / totalWeight : 0;
}
