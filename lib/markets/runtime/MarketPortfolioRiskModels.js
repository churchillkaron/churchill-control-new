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

export function historicalRiskMetrics(returns = [], confidence = 0.95) {
  const values = returns
    .map((value) => number(value, null))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  if (values.length < 2) {
    return {
      observations: values.length,
      annualized_volatility_pct: null,
      var_95_pct: null,
      expected_shortfall_95_pct: null,
    };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / (values.length - 1);
  const volatility = Math.sqrt(Math.max(0, variance));
  const tailProbability = Math.max(0.001, Math.min(0.5, 1 - confidence));
  const quantileIndex = Math.max(
    0,
    Math.min(values.length - 1, Math.floor(values.length * tailProbability)),
  );
  const quantile = values[quantileIndex];
  const tail = values.filter((value) => value <= quantile);
  const expectedShortfall = tail.length
    ? tail.reduce((sum, value) => sum + value, 0) / tail.length
    : quantile;

  return {
    observations: values.length,
    annualized_volatility_pct: volatility * Math.sqrt(252) * 100,
    var_95_pct: Math.max(0, -quantile * 100),
    expected_shortfall_95_pct: Math.max(0, -expectedShortfall * 100),
  };
}

export function projectedPortfolioReturns({
  positions = [],
  proposed = {},
  equity,
  returnsBySymbol = {},
}) {
  const accountEquity = number(equity);
  if (!(accountEquity > 0)) return [];

  const valueBySymbol = new Map();
  for (const position of positions) {
    const ticker = symbol(position.symbol);
    if (!ticker) continue;
    valueBySymbol.set(ticker, Math.max(0, number(position.market_value)));
  }

  const candidate = symbol(proposed.symbol);
  const side = symbol(proposed.side);
  const signedNotional = side === "SELL"
    ? -Math.max(0, number(proposed.notional))
    : Math.max(0, number(proposed.notional));
  if (candidate) {
    valueBySymbol.set(
      candidate,
      Math.max(0, (valueBySymbol.get(candidate) || 0) + signedNotional),
    );
  }

  const active = [...valueBySymbol.entries()]
    .filter(([, value]) => value > 0)
    .map(([ticker, value]) => ({
      ticker,
      value,
      returns: returnsBySymbol[ticker] || [],
    }))
    .filter((row) => row.returns.length > 0);

  if (!active.length) return [];
  const observationCount = Math.min(...active.map((row) => row.returns.length));
  if (!(observationCount > 0)) return [];

  const output = [];
  for (let index = 0; index < observationCount; index += 1) {
    let portfolioReturn = 0;
    for (const row of active) {
      const trailingIndex = row.returns.length - observationCount + index;
      portfolioReturn += (row.value / accountEquity) * number(row.returns[trailingIndex]);
    }
    output.push(portfolioReturn);
  }
  return output;
}

export function evaluateHistoricalPortfolioRisk({
  policy = {},
  equity,
  positions = [],
  proposed = {},
  returnsBySymbol = {},
}) {
  const side = symbol(proposed.side);
  const minObservations = Math.max(
    20,
    number(policy.historical_risk_min_observations, 60),
  );
  const portfolioReturns = projectedPortfolioReturns({
    positions,
    proposed,
    equity,
    returnsBySymbol,
  });
  const portfolioRisk = historicalRiskMetrics(portfolioReturns, 0.95);
  const candidateReturns = returnsBySymbol[symbol(proposed.symbol)] || [];
  const candidateRisk = historicalRiskMetrics(candidateReturns, 0.95);
  const reasons = [];

  if (side === "BUY") {
    if (portfolioRisk.observations < minObservations) {
      reasons.push("Historical portfolio risk evidence is insufficient for new BUY exposure.");
    } else {
      if (
        portfolioRisk.var_95_pct > number(policy.max_portfolio_var_95_pct, 5)
      ) {
        reasons.push("Projected 95% historical VaR exceeds the configured limit.");
      }
      if (
        portfolioRisk.expected_shortfall_95_pct >
        number(policy.max_portfolio_expected_shortfall_95_pct, 8)
      ) {
        reasons.push("Projected 95% expected shortfall exceeds the configured limit.");
      }
    }

    if (
      candidateRisk.observations >= minObservations &&
      candidateRisk.annualized_volatility_pct >
      number(policy.max_position_annualized_volatility_pct, 100)
    ) {
      reasons.push("Candidate annualized volatility exceeds the configured position limit.");
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      minimum_observations: minObservations,
      portfolio: portfolioRisk,
      candidate: candidateRisk,
      max_portfolio_var_95_pct: number(policy.max_portfolio_var_95_pct, 5),
      max_portfolio_expected_shortfall_95_pct: number(
        policy.max_portfolio_expected_shortfall_95_pct,
        8,
      ),
      max_position_annualized_volatility_pct: number(
        policy.max_position_annualized_volatility_pct,
        100,
      ),
    },
  };
}

export function calculatePortfolioRiskBudgetScale({
  metrics = {},
  policy = {},
  softLimitStart = 0.7,
  minimumScale = 0.25,
}) {
  const start = Math.min(0.95, Math.max(0.1, number(softLimitStart, 0.7)));
  const floor = Math.min(1, Math.max(0.05, number(minimumScale, 0.25)));
  const historical = metrics?.historical_risk || {};
  const portfolioHistorical = historical?.portfolio || {};
  const dimensions = [];

  const addDimension = (name, value, limit) => {
    const observed = number(value, null);
    const cap = number(limit, null);
    if (observed === null || !(cap > 0)) return;
    dimensions.push({
      name,
      value: observed,
      limit: cap,
      utilization: observed / cap,
    });
  };

  addDimension(
    "GROSS_EXPOSURE",
    metrics.projected_gross_exposure_pct,
    policy.max_gross_exposure_pct ?? 100,
  );
  if (String(metrics.candidate_sector || "").toUpperCase() !== "UNKNOWN") {
    addDimension(
      "SECTOR_EXPOSURE",
      metrics.projected_sector_exposure_pct,
      policy.max_sector_pct ?? 30,
    );
  }
  addDimension(
    "CORRELATED_EXPOSURE",
    metrics.projected_correlated_exposure_pct,
    policy.max_correlated_exposure_pct ?? 35,
  );
  addDimension(
    "VAR_95",
    portfolioHistorical.var_95_pct,
    policy.max_portfolio_var_95_pct ?? 5,
  );
  addDimension(
    "EXPECTED_SHORTFALL_95",
    portfolioHistorical.expected_shortfall_95_pct,
    policy.max_portfolio_expected_shortfall_95_pct ?? 8,
  );

  if (!dimensions.length) {
    return {
      scale: 1,
      binding_dimension: null,
      max_utilization: 0,
      soft_limit_start: start,
      minimum_scale: floor,
      utilizations: {},
    };
  }

  const binding = [...dimensions].sort(
    (left, right) => right.utilization - left.utilization,
  )[0];
  const utilization = Math.max(0, binding.utilization);
  let scale = 1;

  if (utilization > start) {
    const progress = Math.min(
      1,
      (utilization - start) / Math.max(1 - start, 0.0001),
    );
    scale = 1 - (progress * (1 - floor));
  }

  return {
    scale: Math.min(1, Math.max(floor, scale)),
    binding_dimension: binding.name,
    max_utilization: utilization,
    soft_limit_start: start,
    minimum_scale: floor,
    utilizations: Object.fromEntries(
      dimensions.map((row) => [row.name, row.utilization]),
    ),
  };
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
