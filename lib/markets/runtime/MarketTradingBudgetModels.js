function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function summarizeRollingTradingBudget({
  fills = [],
  equity,
  proposedSide = null,
  proposedNotional = 0,
  policy = {},
}) {
  const accountEquity = number(equity, 0);
  const side = String(proposedSide || "").trim().toUpperCase();
  const rows = Array.isArray(fills) ? fills : [];

  let filledNotional = 0;
  let realizedExecutionCostAmount = 0;
  let costSamples = 0;

  for (const fill of rows) {
    const notional = Math.max(0, number(fill?.notional, 0));
    filledNotional += notional;

    const costBps = number(fill?.metadata?.execution_quality?.total_execution_cost_bps);
    if (costBps !== null && notional > 0) {
      realizedExecutionCostAmount += notional * (Math.max(0, costBps) / 10000);
      costSamples += 1;
    }
  }

  const proposed = side === "BUY"
    ? Math.max(0, number(proposedNotional, 0))
    : 0;
  const projectedTurnoverNotional = filledNotional + proposed;
  const turnoverPct = accountEquity > 0
    ? (filledNotional / accountEquity) * 100
    : null;
  const projectedTurnoverPct = accountEquity > 0
    ? (projectedTurnoverNotional / accountEquity) * 100
    : null;
  const executionCostPctEquity = accountEquity > 0
    ? (realizedExecutionCostAmount / accountEquity) * 100
    : null;

  const maxTurnoverPct = number(
    policy.max_rolling_24h_turnover_pct,
    100,
  );
  const maxExecutionCostPctEquity = number(
    policy.max_rolling_24h_execution_cost_pct_equity,
    0.25,
  );
  const reasons = [];

  if (side === "BUY") {
    if (!(accountEquity > 0)) {
      reasons.push("Portfolio equity must be positive for the trading-budget gate.");
    } else {
      if (
        maxTurnoverPct > 0 &&
        projectedTurnoverPct !== null &&
        projectedTurnoverPct > maxTurnoverPct
      ) {
        reasons.push("Projected rolling 24-hour turnover exceeds the configured limit.");
      }
      if (
        maxExecutionCostPctEquity > 0 &&
        executionCostPctEquity !== null &&
        executionCostPctEquity > maxExecutionCostPctEquity
      ) {
        reasons.push("Rolling 24-hour realized execution-cost leakage exceeds the configured limit.");
      }
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      fill_count: rows.length,
      execution_cost_samples: costSamples,
      filled_notional: filledNotional,
      proposed_buy_notional: proposed,
      projected_turnover_notional: projectedTurnoverNotional,
      turnover_pct_equity: turnoverPct,
      projected_turnover_pct_equity: projectedTurnoverPct,
      realized_execution_cost_amount: realizedExecutionCostAmount,
      realized_execution_cost_pct_equity: executionCostPctEquity,
      max_rolling_24h_turnover_pct: maxTurnoverPct,
      max_rolling_24h_execution_cost_pct_equity: maxExecutionCostPctEquity,
      authority_effect: "PAPER_ONLY",
    },
  };
}
