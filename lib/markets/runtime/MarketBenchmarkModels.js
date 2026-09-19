function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortedBars(bars = []) {
  return [...(Array.isArray(bars) ? bars : [])]
    .filter((row) => number(row?.close) !== null && row?.bar_time)
    .sort((left, right) => new Date(left.bar_time) - new Date(right.bar_time));
}

export function benchmarkReturnForInterval({
  bars = [],
  predictionTime,
  evaluationTime,
}) {
  const rows = sortedBars(bars);
  const predictionMs = new Date(predictionTime || 0).getTime();
  const evaluationMs = new Date(evaluationTime || 0).getTime();

  if (!Number.isFinite(predictionMs) || !Number.isFinite(evaluationMs) || evaluationMs <= predictionMs) {
    return {
      available: false,
      reason: "INVALID_INTERVAL",
      benchmark_return: null,
      start_bar: null,
      end_bar: null,
    };
  }

  const startBar = [...rows]
    .reverse()
    .find((row) => new Date(row.bar_time).getTime() <= predictionMs) || null;
  const endBar = rows.find(
    (row) => new Date(row.bar_time).getTime() >= evaluationMs,
  ) || null;

  const startPrice = number(startBar?.close);
  const endPrice = number(endBar?.close);
  if (!(startPrice > 0) || !(endPrice > 0)) {
    return {
      available: false,
      reason: "BENCHMARK_INTERVAL_BARS_UNAVAILABLE",
      benchmark_return: null,
      start_bar: startBar,
      end_bar: endBar,
    };
  }

  return {
    available: true,
    reason: null,
    benchmark_return: (endPrice - startPrice) / startPrice,
    start_bar: startBar,
    end_bar: endBar,
  };
}

export function applyBenchmarkAttribution({
  realizedReturn,
  benchmarkReturn,
}) {
  const realized = number(realizedReturn);
  const benchmark = number(benchmarkReturn);
  return {
    benchmark_return: benchmark,
    excess_return: realized !== null && benchmark !== null
      ? realized - benchmark
      : null,
  };
}

export function summarizeBenchmarkAttribution(outcomes = []) {
  const rows = (Array.isArray(outcomes) ? outcomes : [])
    .filter((row) => number(row?.benchmark_return) !== null && number(row?.excess_return) !== null);

  if (!rows.length) {
    return {
      sample_count: 0,
      avg_realized_return: null,
      avg_benchmark_return: null,
      avg_excess_return: null,
      benchmark_outperformance_rate: null,
      positive_excess_rate: null,
    };
  }

  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const realized = rows.map((row) => number(row.realized_return, 0));
  const benchmarks = rows.map((row) => number(row.benchmark_return, 0));
  const excess = rows.map((row) => number(row.excess_return, 0));
  const outperformed = excess.filter((value) => value > 0).length;

  return {
    sample_count: rows.length,
    avg_realized_return: average(realized),
    avg_benchmark_return: average(benchmarks),
    avg_excess_return: average(excess),
    benchmark_outperformance_rate: outperformed / rows.length,
    positive_excess_rate: outperformed / rows.length,
  };
}
