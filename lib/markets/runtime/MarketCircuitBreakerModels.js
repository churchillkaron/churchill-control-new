function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluatePortfolioCircuitBreaker({
  policy = {},
  account = {},
  marked = {},
}) {
  const equity = number(marked.equity, number(account.equity, 0));
  const dailyStart = number(account.daily_equity_start, equity);
  const highWater = Math.max(number(account.high_water_equity, equity), equity);
  const dailyLossPct = dailyStart > 0 && equity < dailyStart
    ? ((dailyStart - equity) / dailyStart) * 100
    : 0;
  const drawdownPct = highWater > 0 && equity < highWater
    ? ((highWater - equity) / highWater) * 100
    : 0;

  const dailyLimit = Math.max(0, number(policy.max_daily_loss_pct, 2));
  const drawdownLimit = Math.max(0, number(policy.max_portfolio_drawdown_pct, 10));
  const reasons = [];

  if (dailyLimit > 0 && dailyLossPct >= dailyLimit) {
    reasons.push("MAX_DAILY_LOSS_BREACH");
  }
  if (drawdownLimit > 0 && drawdownPct >= drawdownLimit) {
    reasons.push("MAX_PORTFOLIO_DRAWDOWN_BREACH");
  }

  return {
    breached: reasons.length > 0,
    reasons,
    metrics: {
      equity,
      daily_equity_start: dailyStart,
      high_water_equity: highWater,
      daily_loss_pct: dailyLossPct,
      drawdown_pct: drawdownPct,
      max_daily_loss_pct: dailyLimit,
      max_portfolio_drawdown_pct: drawdownLimit,
    },
  };
}
