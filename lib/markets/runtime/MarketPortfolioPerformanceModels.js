function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return null;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function dailyEquitySeries(snapshots = []) {
  const rows = [...(Array.isArray(snapshots) ? snapshots : [])]
    .filter((row) => number(row?.equity) !== null && row?.recorded_at)
    .sort((left, right) => new Date(left.recorded_at) - new Date(right.recorded_at));

  const byDay = new Map();
  for (const row of rows) {
    const day = new Date(row.recorded_at).toISOString().slice(0, 10);
    byDay.set(day, row);
  }
  return [...byDay.values()].sort(
    (left, right) => new Date(left.recorded_at) - new Date(right.recorded_at),
  );
}

export function equityReturns(series = []) {
  const rows = dailyEquitySeries(series);
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const prior = number(rows[index - 1]?.equity);
    const current = number(rows[index]?.equity);
    if (prior > 0 && current !== null) {
      returns.push((current - prior) / prior);
    }
  }
  return returns;
}

export function maximumDrawdownPct(snapshots = []) {
  const rows = [...(Array.isArray(snapshots) ? snapshots : [])]
    .filter((row) => number(row?.equity) !== null)
    .sort((left, right) => new Date(left.recorded_at || 0) - new Date(right.recorded_at || 0));

  let highWater = null;
  let maximum = 0;
  for (const row of rows) {
    const equity = number(row.equity, 0);
    highWater = highWater === null ? equity : Math.max(highWater, equity);
    if (highWater > 0) {
      maximum = Math.max(maximum, ((highWater - equity) / highWater) * 100);
    }
  }
  return maximum;
}

export function summarizePortfolioPerformance({
  snapshots = [],
  riskFreeRateAnnual = 0,
  tradingDaysPerYear = 252,
  minimumRiskAdjustedObservations = 20,
}) {
  const daily = dailyEquitySeries(snapshots);
  const returns = equityReturns(daily);
  const firstEquity = number(daily[0]?.equity);
  const lastEquity = number(daily.at(-1)?.equity);
  const firstTime = daily[0]?.recorded_at ? new Date(daily[0].recorded_at).getTime() : null;
  const lastTime = daily.at(-1)?.recorded_at ? new Date(daily.at(-1).recorded_at).getTime() : null;
  const observationDays = firstTime !== null && lastTime !== null
    ? Math.max(0, (lastTime - firstTime) / (24 * 60 * 60 * 1000))
    : 0;
  const totalReturn = firstEquity > 0 && lastEquity !== null
    ? (lastEquity - firstEquity) / firstEquity
    : null;

  const dailyVolatility = sampleStandardDeviation(returns);
  const annualizedVolatility = dailyVolatility === null
    ? null
    : dailyVolatility * Math.sqrt(tradingDaysPerYear);

  const annualizedReturn = (
    totalReturn !== null &&
    observationDays >= 30 &&
    totalReturn > -1
  )
    ? ((1 + totalReturn) ** (365.25 / observationDays)) - 1
    : null;

  const riskFreeDaily = ((1 + Math.max(-0.99, number(riskFreeRateAnnual, 0))) ** (1 / tradingDaysPerYear)) - 1;
  const enoughRiskHistory = returns.length >= minimumRiskAdjustedObservations;
  const meanDailyReturn = average(returns);
  const excessDaily = returns.map((value) => value - riskFreeDaily);
  const excessMean = average(excessDaily);
  const excessStd = sampleStandardDeviation(excessDaily);
  const downside = excessDaily.filter((value) => value < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(downside.reduce((sum, value) => sum + (value ** 2), 0) / downside.length)
    : null;

  const sharpe = enoughRiskHistory && excessStd > 0 && excessMean !== null
    ? (excessMean / excessStd) * Math.sqrt(tradingDaysPerYear)
    : null;
  const sortino = enoughRiskHistory && downsideDeviation > 0 && excessMean !== null
    ? (excessMean / downsideDeviation) * Math.sqrt(tradingDaysPerYear)
    : null;

  return {
    snapshot_count: Array.isArray(snapshots) ? snapshots.length : 0,
    daily_observation_count: daily.length,
    daily_return_count: returns.length,
    observation_days: observationDays,
    first_equity: firstEquity,
    last_equity: lastEquity,
    total_return: totalReturn,
    annualized_return: annualizedReturn,
    annualized_volatility: annualizedVolatility,
    sharpe_ratio: sharpe,
    sortino_ratio: sortino,
    max_drawdown_pct: maximumDrawdownPct(snapshots),
    positive_day_rate: returns.length
      ? returns.filter((value) => value > 0).length / returns.length
      : null,
    risk_free_rate_annual: number(riskFreeRateAnnual, 0),
    risk_adjusted_history_sufficient: enoughRiskHistory,
    minimum_risk_adjusted_observations: minimumRiskAdjustedObservations,
  };
}
