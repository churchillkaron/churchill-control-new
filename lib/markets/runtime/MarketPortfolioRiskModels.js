function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function pearsonCorrelation(left = [], right = []) {
  const count = Math.min(left.length, right.length);
  if (count < 10) return null;

  const a = left.slice(-count).map((value) => number(value, null));
  const b = right.slice(-count).map((value) => number(value, null));
  if (a.some((value) => value === null) || b.some((value) => value === null)) return null;

  const meanA = a.reduce((sum, value) => sum + value, 0) / count;
  const meanB = b.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let index = 0; index < count; index += 1) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }

  if (!(varianceA > 0) || !(varianceB > 0)) return null;
  return covariance / Math.sqrt(varianceA * varianceB);
}

export function returnsFromBars(bars = []) {
  const sorted = [...bars]
    .filter((row) => number(row?.close, null) !== null)
    .sort((a, b) => new Date(a.bar_time || 0) - new Date(b.bar_time || 0));

  const output = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = number(sorted[index - 1].close, null);
    const current = number(sorted[index].close, null);
    if (!(previous > 0) || current === null) continue;
    output.push((current - previous) / previous);
  }
  return output;
}

export function evaluatePortfolioConcentration({
  policy = {},
  equity,
  positions = [],
  proposed = {},
  sectorBySymbol = {},
  returnsBySymbol = {},
}) {
  const reasons = [];
  const accountEquity = number(equity);
  if (!(accountEquity > 0)) {
    return {
      approved: false,
      reasons: ["Portfolio equity must be greater than zero."],
      metrics: {},
    };
  }

  const candidateSymbol = symbol(proposed.symbol);
  const side = symbol(proposed.side);
  const orderNotional = Math.max(0, number(proposed.notional));
  const signedNotional = side === "SELL" ? -orderNotional : orderNotional;
  const candidateSector = String(sectorBySymbol[candidateSymbol] || "UNKNOWN").trim() || "UNKNOWN";

  const positionValueBySymbol = new Map();
  let currentGross = 0;
  let currentSectorValue = 0;

  for (const position of positions) {
    const ticker = symbol(position.symbol);
    const value = Math.max(0, number(position.market_value));
    positionValueBySymbol.set(ticker, value);
    currentGross += value;
    if (String(sectorBySymbol[ticker] || "UNKNOWN").trim() === candidateSector) {
      currentSectorValue += value;
    }
  }

  const currentCandidateValue = positionValueBySymbol.get(candidateSymbol) || 0;
  const projectedCandidateValue = Math.max(0, currentCandidateValue + signedNotional);
  const projectedGross = Math.max(0, currentGross + signedNotional);
  const projectedSectorValue = Math.max(0, currentSectorValue + signedNotional);

  const grossPct = (projectedGross / accountEquity) * 100;
  const sectorPct = (projectedSectorValue / accountEquity) * 100;

  const maxGrossPct = number(policy.max_gross_exposure_pct, 100);
  const maxSectorPct = number(policy.max_sector_pct, 30);
  if (grossPct > maxGrossPct) {
    reasons.push("Projected gross exposure exceeds the configured portfolio limit.");
  }
  if (candidateSector !== "UNKNOWN" && sectorPct > maxSectorPct) {
    reasons.push("Projected sector exposure exceeds the configured portfolio limit.");
  }

  const candidateReturns = returnsBySymbol[candidateSymbol] || [];
  const threshold = number(policy.correlation_threshold, 0.8);
  let correlatedValue = projectedCandidateValue;
  const correlations = {};

  for (const position of positions) {
    const ticker = symbol(position.symbol);
    if (!ticker || ticker === candidateSymbol) continue;
    const correlation = pearsonCorrelation(
      candidateReturns,
      returnsBySymbol[ticker] || [],
    );
    correlations[ticker] = correlation;
    if (correlation !== null && correlation >= threshold) {
      correlatedValue += Math.max(0, number(position.market_value));
    }
  }

  const correlatedPct = (correlatedValue / accountEquity) * 100;
  const maxCorrelatedPct = number(policy.max_correlated_exposure_pct, 35);
  if (candidateReturns.length >= 10 && correlatedPct > maxCorrelatedPct) {
    reasons.push("Projected correlated exposure exceeds the configured portfolio limit.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      candidate_symbol: candidateSymbol,
      candidate_sector: candidateSector,
      projected_gross_exposure_pct: grossPct,
      projected_sector_exposure_pct: sectorPct,
      projected_correlated_exposure_pct: correlatedPct,
      correlation_threshold: threshold,
      correlations,
    },
  };
}
