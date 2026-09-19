function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ageHours(value, now = new Date()) {
  const time = new Date(value || 0).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(nowMs) || time <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - time) / (60 * 60 * 1000));
}

export function evaluateStrategyReadiness({
  action,
  automationPolicy = {},
  backtest = null,
  now = new Date(),
}) {
  const side = String(action || "").trim().toUpperCase();

  if (side === "SELL") {
    return {
      ready: true,
      status: "DE_RISKING_ALLOWED",
      reasons: [],
      metrics: {
        live_authority_effect: "NONE",
      },
    };
  }

  if (side !== "BUY") {
    return {
      ready: true,
      status: "NOT_APPLICABLE",
      reasons: [],
      metrics: {
        live_authority_effect: "NONE",
      },
    };
  }

  if (automationPolicy.require_walk_forward_validation === false) {
    return {
      ready: true,
      status: "VALIDATION_NOT_REQUIRED",
      reasons: [],
      metrics: {
        live_authority_effect: "NONE",
      },
    };
  }

  const reasons = [];
  if (!backtest || backtest.status !== "COMPLETED") {
    reasons.push("A completed walk-forward validation run is required.");
  }

  const maxAgeHours = number(automationPolicy.validation_max_age_hours, 168);
  const runAgeHours = ageHours(backtest?.completed_at || backtest?.started_at, now);
  if (runAgeHours > maxAgeHours) {
    reasons.push("Walk-forward validation is stale.");
  }

  const tradeCount = number(backtest?.trade_count, 0);
  const minTrades = number(automationPolicy.validation_min_trades, 5);
  if (tradeCount < minTrades) {
    reasons.push("Walk-forward validation has insufficient trade count.");
  }

  const hitRate = backtest?.directional_hit_rate === null || backtest?.directional_hit_rate === undefined
    ? null
    : number(backtest.directional_hit_rate, 0);
  const minHitRate = number(automationPolicy.validation_min_directional_hit_rate, 0.5);
  if (hitRate === null || hitRate < minHitRate) {
    reasons.push("Walk-forward directional hit rate is below the configured floor.");
  }

  const drawdown = number(backtest?.max_drawdown_pct, Number.POSITIVE_INFINITY);
  const maxDrawdown = number(automationPolicy.validation_max_drawdown_pct, 25);
  if (drawdown > maxDrawdown) {
    reasons.push("Walk-forward drawdown exceeds the configured ceiling.");
  }

  const totalReturn = number(backtest?.total_return, Number.NEGATIVE_INFINITY);
  const minReturn = number(automationPolicy.validation_min_total_return, 0);
  if (totalReturn < minReturn) {
    reasons.push("Walk-forward total return is below the configured floor.");
  }

  return {
    ready: reasons.length === 0,
    status: reasons.length === 0 ? "READY_FOR_AUTONOMOUS_PAPER" : "NOT_READY",
    reasons,
    metrics: {
      validation_age_hours: Number.isFinite(runAgeHours) ? runAgeHours : null,
      validation_max_age_hours: maxAgeHours,
      trade_count: tradeCount,
      validation_min_trades: minTrades,
      directional_hit_rate: hitRate,
      validation_min_directional_hit_rate: minHitRate,
      max_drawdown_pct: Number.isFinite(drawdown) ? drawdown : null,
      validation_max_drawdown_pct: maxDrawdown,
      total_return: Number.isFinite(totalReturn) ? totalReturn : null,
      validation_min_total_return: minReturn,
      live_authority_effect: "NONE",
    },
  };
}
