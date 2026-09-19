function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values = []) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

export function summarizeStrategyOutcomes(outcomes = []) {
  const rows = Array.isArray(outcomes) ? outcomes : [];
  const hitRows = rows
    .map((row) => row?.directional_hit)
    .filter((value) => value === true || value === false);
  const brierRows = rows
    .map((row) => number(row?.squared_error))
    .filter((value) => value !== null);
  const logLossRows = rows
    .map((row) => number(row?.log_loss))
    .filter((value) => value !== null);
  const excessRows = rows
    .map((row) => number(row?.excess_return))
    .filter((value) => value !== null);

  return {
    sample_count: rows.length,
    directional_samples: hitRows.length,
    directional_hit_rate: hitRows.length
      ? hitRows.filter(Boolean).length / hitRows.length
      : null,
    avg_brier: average(brierRows),
    avg_log_loss: average(logLossRows),
    avg_excess_return: average(excessRows),
  };
}

export function evaluateStrategyDrift({
  action,
  automationPolicy = {},
  outcomes = [],
}) {
  const side = String(action || "").trim().toUpperCase();

  if (side === "SELL") {
    return {
      ready: true,
      status: "DE_RISKING_ALLOWED",
      reasons: [],
      metrics: {
        sample_count: outcomes.length,
        authority_effect: "NONE",
      },
    };
  }

  if (side !== "BUY") {
    return {
      ready: true,
      status: "NOT_APPLICABLE",
      reasons: [],
      metrics: {
        sample_count: outcomes.length,
        authority_effect: "NONE",
      },
    };
  }

  if (automationPolicy.require_strategy_health_gate === false) {
    return {
      ready: true,
      status: "HEALTH_GATE_DISABLED",
      reasons: [],
      metrics: {
        sample_count: outcomes.length,
        authority_effect: "NONE",
      },
    };
  }

  const summary = summarizeStrategyOutcomes(outcomes);
  const minSamples = Math.max(
    5,
    number(automationPolicy.strategy_health_min_samples, 20),
  );

  if (summary.sample_count < minSamples) {
    return {
      ready: true,
      status: "INSUFFICIENT_MATURE_OUTCOMES",
      reasons: [],
      metrics: {
        ...summary,
        minimum_samples: minSamples,
        authority_effect: "NONE",
      },
    };
  }

  const maxBrier = number(
    automationPolicy.strategy_health_max_brier,
    0.30,
  );
  const maxLogLoss = number(
    automationPolicy.strategy_health_max_log_loss,
    0.90,
  );
  const minHitRate = number(
    automationPolicy.strategy_health_min_directional_hit_rate,
    0.45,
  );
  const minExcessReturn = number(
    automationPolicy.strategy_health_min_avg_excess_return,
    -0.01,
  );
  const reasons = [];

  if (summary.avg_brier === null || summary.avg_brier > maxBrier) {
    reasons.push("Recent prediction Brier score exceeds the configured strategy-health ceiling.");
  }
  if (summary.avg_log_loss === null || summary.avg_log_loss > maxLogLoss) {
    reasons.push("Recent prediction log loss exceeds the configured strategy-health ceiling.");
  }
  if (
    summary.directional_hit_rate === null ||
    summary.directional_hit_rate < minHitRate
  ) {
    reasons.push("Recent directional hit rate is below the configured strategy-health floor.");
  }
  if (
    summary.avg_excess_return !== null &&
    summary.avg_excess_return < minExcessReturn
  ) {
    reasons.push("Recent average benchmark excess return is below the configured strategy-health floor.");
  }

  return {
    ready: reasons.length === 0,
    status: reasons.length === 0 ? "STRATEGY_HEALTHY" : "STRATEGY_DRIFT_DETECTED",
    reasons,
    metrics: {
      ...summary,
      minimum_samples: minSamples,
      max_brier: maxBrier,
      max_log_loss: maxLogLoss,
      min_directional_hit_rate: minHitRate,
      min_avg_excess_return: minExcessReturn,
      authority_effect: "NONE",
    },
  };
}
