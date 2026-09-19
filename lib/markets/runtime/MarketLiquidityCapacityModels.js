function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbol(value) {
  return String(value || "").trim().toUpperCase();
}

export function averageDailyDollarVolume(bars = [], windowDays = 20) {
  const rows = (Array.isArray(bars) ? bars : [])
    .filter((row) => number(row?.close) > 0 && number(row?.volume) > 0)
    .sort((a, b) => new Date(a.bar_time || 0) - new Date(b.bar_time || 0))
    .slice(-Math.max(1, Math.floor(number(windowDays, 20))));

  if (!rows.length) {
    return {
      observations: 0,
      average_daily_dollar_volume: null,
    };
  }

  const total = rows.reduce(
    (sum, row) => sum + (number(row.close, 0) * number(row.volume, 0)),
    0,
  );

  return {
    observations: rows.length,
    average_daily_dollar_volume: total / rows.length,
  };
}

export function evaluateLiquidityCapacity({
  action,
  positions = [],
  proposedSymbol,
  proposedNotional = 0,
  bars = [],
  policy = {},
}) {
  const side = symbol(action);
  const candidate = symbol(proposedSymbol);
  const currentPosition = (Array.isArray(positions) ? positions : [])
    .find((row) => symbol(row?.symbol) === candidate);
  const currentValue = Math.max(0, number(currentPosition?.market_value, 0));
  const proposed = side === "BUY"
    ? Math.max(0, number(proposedNotional, 0))
    : 0;
  const projectedValue = currentValue + proposed;

  const windowDays = Math.max(
    5,
    Math.floor(number(policy.liquidity_adv_window_days, 20)),
  );
  const minObservations = Math.max(
    5,
    Math.floor(number(policy.liquidity_min_observations, 15)),
  );
  const maxPositionAdvPct = Math.max(
    0.1,
    number(policy.max_position_adv_pct, 10),
  );
  const participationPct = Math.max(
    0.1,
    number(policy.liquidation_participation_pct, 10),
  );
  const maxDaysToLiquidate = Math.max(
    0.1,
    number(policy.max_days_to_liquidate, 5),
  );

  const adv = averageDailyDollarVolume(bars, windowDays);
  const advAmount = number(adv.average_daily_dollar_volume);
  const projectedPositionAdvPct = advAmount && advAmount > 0
    ? (projectedValue / advAmount) * 100
    : null;
  const executablePerDay = advAmount && advAmount > 0
    ? advAmount * (participationPct / 100)
    : null;
  const daysToLiquidate = executablePerDay && executablePerDay > 0
    ? projectedValue / executablePerDay
    : null;

  const reasons = [];
  if (side === "BUY") {
    if (adv.observations < minObservations || !(advAmount > 0)) {
      reasons.push("Average daily dollar-volume evidence is insufficient for new BUY exposure.");
    } else {
      if (
        projectedPositionAdvPct !== null &&
        projectedPositionAdvPct > maxPositionAdvPct
      ) {
        reasons.push("Projected position size exceeds the configured average-daily-volume capacity.");
      }
      if (
        daysToLiquidate !== null &&
        daysToLiquidate > maxDaysToLiquidate
      ) {
        reasons.push("Projected days-to-liquidate exceeds the configured liquidity limit.");
      }
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      symbol: candidate,
      observations: adv.observations,
      adv_window_days: windowDays,
      minimum_observations: minObservations,
      average_daily_dollar_volume: advAmount,
      current_position_value: currentValue,
      proposed_buy_notional: proposed,
      projected_position_value: projectedValue,
      projected_position_adv_pct: projectedPositionAdvPct,
      max_position_adv_pct: maxPositionAdvPct,
      liquidation_participation_pct: participationPct,
      projected_days_to_liquidate: daysToLiquidate,
      max_days_to_liquidate: maxDaysToLiquidate,
      authority_effect: "PAPER_ONLY",
    },
  };
}
