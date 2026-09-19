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

export function betaToBenchmark(assetReturns = [], benchmarkReturns = []) {
  const count = Math.min(assetReturns.length, benchmarkReturns.length);
  if (count < 10) return null;

  const asset = assetReturns.slice(-count).map((value) => number(value, null));
  const benchmark = benchmarkReturns.slice(-count).map((value) => number(value, null));
  if (
    asset.some((value) => value === null) ||
    benchmark.some((value) => value === null)
  ) {
    return null;
  }

  const assetMean = asset.reduce((sum, value) => sum + value, 0) / count;
  const benchmarkMean = benchmark.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0;
  let benchmarkVariance = 0;

  for (let index = 0; index < count; index += 1) {
    covariance += (asset[index] - assetMean) * (benchmark[index] - benchmarkMean);
    benchmarkVariance += (benchmark[index] - benchmarkMean) ** 2;
  }

  if (!(benchmarkVariance > 0)) return null;
  return covariance / benchmarkVariance;
}

export function evaluatePortfolioBetaRisk({
  policy = {},
  equity,
  positions = [],
  proposed = {},
  returnsBySymbol = {},
  benchmarkReturns = [],
  benchmarkSymbol = null,
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
  const beta = betaToBenchmark(portfolioReturns, benchmarkReturns);
  const observationCount = Math.min(
    portfolioReturns.length,
    benchmarkReturns.length,
  );
  const maxPortfolioBeta = Math.max(
    0.1,
    number(policy.max_portfolio_beta, 1.5),
  );
  const reasons = [];

  if (side === "BUY") {
    if (observationCount < minObservations || beta === null) {
      reasons.push("Benchmark beta evidence is insufficient for new BUY exposure.");
    } else if (Math.abs(beta) > maxPortfolioBeta) {
      reasons.push("Projected portfolio beta exceeds the configured limit.");
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      benchmark_symbol: benchmarkSymbol,
      observations: observationCount,
      projected_beta: beta,
      max_portfolio_beta: maxPortfolioBeta,
    },
  };
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
  const currentPortfolioReturns = projectedPortfolioReturns({
    positions,
    proposed: {},
    equity,
    returnsBySymbol,
  });
  const portfolioReturns = projectedPortfolioReturns({
    positions,
    proposed,
    equity,
    returnsBySymbol,
  });
  const currentPortfolioRisk = historicalRiskMetrics(currentPortfolioReturns, 0.95);
  const portfolioRisk = historicalRiskMetrics(portfolioReturns, 0.95);
  const incrementalVar95Pct = Math.max(
    0,
    portfolioRisk.var_95_pct - currentPortfolioRisk.var_95_pct,
  );
  const incrementalExpectedShortfall95Pct = Math.max(
    0,
    portfolioRisk.expected_shortfall_95_pct -
      currentPortfolioRisk.expected_shortfall_95_pct,
  );
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
      if (
        incrementalVar95Pct >
        number(policy.max_incremental_var_95_pct, 1.5)
      ) {
        reasons.push("Incremental 95% VaR from the proposed trade exceeds the configured limit.");
      }
      if (
        incrementalExpectedShortfall95Pct >
        number(policy.max_incremental_expected_shortfall_95_pct, 2.5)
      ) {
        reasons.push("Incremental 95% expected shortfall from the proposed trade exceeds the configured limit.");
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
      current_portfolio: currentPortfolioRisk,
      portfolio: portfolioRisk,
      incremental_var_95_pct: incrementalVar95Pct,
      incremental_expected_shortfall_95_pct: incrementalExpectedShortfall95Pct,
      candidate: candidateRisk,
      max_incremental_var_95_pct: number(policy.max_incremental_var_95_pct, 1.5),
      max_incremental_expected_shortfall_95_pct: number(
        policy.max_incremental_expected_shortfall_95_pct,
        2.5,
      ),
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

export function evaluatePortfolioStressRisk({
  policy = {},
  equity,
  positions = [],
  proposed = {},
  sectorBySymbol = {},
  returnsBySymbol = {},
}) {
  const accountEquity = number(equity);
  const side = symbol(proposed.side);
  if (!(accountEquity > 0)) {
    return {
      approved: false,
      reasons: ["Portfolio equity must be greater than zero for stress testing."],
      metrics: {},
    };
  }

  const candidate = symbol(proposed.symbol);
  const candidateSector = String(sectorBySymbol[candidate] || "UNKNOWN").trim() || "UNKNOWN";
  const signedNotional = side === "SELL"
    ? -Math.max(0, number(proposed.notional))
    : Math.max(0, number(proposed.notional));

  const valueBySymbol = new Map();
  for (const position of positions) {
    const ticker = symbol(position.symbol);
    if (!ticker) continue;
    valueBySymbol.set(ticker, Math.max(0, number(position.market_value)));
  }
  if (candidate) {
    valueBySymbol.set(
      candidate,
      Math.max(0, (valueBySymbol.get(candidate) || 0) + signedNotional),
    );
  }

  const grossValue = [...valueBySymbol.values()].reduce((sum, value) => sum + value, 0);
  const marketShockPct = Math.max(0, number(policy.stress_market_shock_pct, 8));
  const sectorShockPct = Math.max(0, number(policy.stress_sector_shock_pct, 12));
  const clusterShockPct = Math.max(0, number(policy.stress_correlated_cluster_shock_pct, 15));
  const singleNameShockPct = Math.max(0, number(policy.stress_single_name_shock_pct, 20));

  let sectorValue = 0;
  for (const [ticker, value] of valueBySymbol.entries()) {
    if (
      candidateSector !== "UNKNOWN" &&
      String(sectorBySymbol[ticker] || "UNKNOWN").trim() === candidateSector
    ) {
      sectorValue += value;
    }
  }

  let correlatedValue = valueBySymbol.get(candidate) || 0;
  const candidateReturns = returnsBySymbol[candidate] || [];
  const correlationThreshold = number(policy.correlation_threshold, 0.8);
  const correlations = {};
  for (const [ticker, value] of valueBySymbol.entries()) {
    if (!ticker || ticker === candidate) continue;
    const correlation = pearsonCorrelation(
      candidateReturns,
      returnsBySymbol[ticker] || [],
    );
    correlations[ticker] = correlation;
    if (correlation !== null && correlation >= correlationThreshold) {
      correlatedValue += value;
    }
  }

  const singleNameValue = valueBySymbol.get(candidate) || 0;
  const scenarios = [
    {
      id: "MARKET_SELLOFF",
      shocked_value: grossValue,
      shock_pct: marketShockPct,
    },
    {
      id: "SECTOR_SELLOFF",
      shocked_value: sectorValue,
      shock_pct: sectorShockPct,
    },
    {
      id: "CORRELATED_CLUSTER_SELLOFF",
      shocked_value: correlatedValue,
      shock_pct: clusterShockPct,
    },
    {
      id: "SINGLE_NAME_GAP",
      shocked_value: singleNameValue,
      shock_pct: singleNameShockPct,
    },
  ].map((scenario) => {
    const lossAmount = scenario.shocked_value * (scenario.shock_pct / 100);
    return {
      ...scenario,
      loss_amount: lossAmount,
      loss_pct_equity: (lossAmount / accountEquity) * 100,
    };
  });

  const worst = [...scenarios].sort(
    (left, right) => right.loss_pct_equity - left.loss_pct_equity,
  )[0] || null;
  const maxStressLossPct = Math.max(0, number(policy.max_portfolio_stress_loss_pct, 12));
  const reasons = [];

  if (
    side === "BUY" &&
    worst &&
    maxStressLossPct > 0 &&
    worst.loss_pct_equity > maxStressLossPct
  ) {
    reasons.push("Projected portfolio stress loss exceeds the configured limit.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      candidate_symbol: candidate,
      candidate_sector: candidateSector,
      max_portfolio_stress_loss_pct: maxStressLossPct,
      worst_scenario: worst,
      scenarios,
      correlations,
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
  const stress = metrics?.stress_risk || {};
  const betaRisk = metrics?.benchmark_beta || {};
  const liquidity = metrics?.liquidity_capacity || {};
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
  if (String(metrics.candidate_industry || "").toUpperCase() !== "UNKNOWN") {
    addDimension(
      "INDUSTRY_EXPOSURE",
      metrics.projected_industry_exposure_pct,
      policy.max_industry_pct ?? 20,
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
  addDimension(
    "INCREMENTAL_VAR_95",
    historical.incremental_var_95_pct,
    policy.max_incremental_var_95_pct ?? 1.5,
  );
  addDimension(
    "INCREMENTAL_ES_95",
    historical.incremental_expected_shortfall_95_pct,
    policy.max_incremental_expected_shortfall_95_pct ?? 2.5,
  );
  addDimension(
    "STRESS_LOSS",
    stress?.worst_scenario?.loss_pct_equity,
    policy.max_portfolio_stress_loss_pct ?? 12,
  );
  addDimension(
    "PORTFOLIO_BETA",
    betaRisk.projected_beta == null ? null : Math.abs(betaRisk.projected_beta),
    policy.max_portfolio_beta ?? 1.5,
  );
  addDimension(
    "POSITION_ADV_CAPACITY",
    liquidity.projected_position_adv_pct,
    policy.max_position_adv_pct ?? 10,
  );
  addDimension(
    "DAYS_TO_LIQUIDATE",
    liquidity.projected_days_to_liquidate,
    policy.max_days_to_liquidate ?? 5,
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
  industryBySymbol = {},
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
  const candidateIndustry = String(industryBySymbol[candidateSymbol] || "UNKNOWN").trim() || "UNKNOWN";

  const positionValueBySymbol = new Map();
  let currentGross = 0;
  let currentSectorValue = 0;
  let currentIndustryValue = 0;

  for (const position of positions) {
    const ticker = symbol(position.symbol);
    const value = Math.max(0, number(position.market_value));
    positionValueBySymbol.set(ticker, value);
    currentGross += value;
    if (String(sectorBySymbol[ticker] || "UNKNOWN").trim() === candidateSector) {
      currentSectorValue += value;
    }
    if (String(industryBySymbol[ticker] || "UNKNOWN").trim() === candidateIndustry) {
      currentIndustryValue += value;
    }
  }

  const currentCandidateValue = positionValueBySymbol.get(candidateSymbol) || 0;
  const projectedCandidateValue = Math.max(0, currentCandidateValue + signedNotional);
  const projectedGross = Math.max(0, currentGross + signedNotional);
  const projectedSectorValue = Math.max(0, currentSectorValue + signedNotional);
  const projectedIndustryValue = Math.max(0, currentIndustryValue + signedNotional);

  const grossPct = (projectedGross / accountEquity) * 100;
  const sectorPct = (projectedSectorValue / accountEquity) * 100;
  const industryPct = (projectedIndustryValue / accountEquity) * 100;

  const maxGrossPct = number(policy.max_gross_exposure_pct, 100);
  const maxSectorPct = number(policy.max_sector_pct, 30);
  const maxIndustryPct = number(policy.max_industry_pct, 20);
  if (grossPct > maxGrossPct) {
    reasons.push("Projected gross exposure exceeds the configured portfolio limit.");
  }
  if (candidateSector !== "UNKNOWN" && sectorPct > maxSectorPct) {
    reasons.push("Projected sector exposure exceeds the configured portfolio limit.");
  }
  if (candidateIndustry !== "UNKNOWN" && industryPct > maxIndustryPct) {
    reasons.push("Projected industry exposure exceeds the configured portfolio limit.");
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
      candidate_industry: candidateIndustry,
      projected_gross_exposure_pct: grossPct,
      projected_sector_exposure_pct: sectorPct,
      projected_industry_exposure_pct: industryPct,
      projected_correlated_exposure_pct: correlatedPct,
      correlation_threshold: threshold,
      correlations,
    },
  };
}
