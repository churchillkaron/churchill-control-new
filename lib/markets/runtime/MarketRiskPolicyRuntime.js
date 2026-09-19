function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluatePaperTradeRisk({
  policy = {},
  decision = {},
  portfolio = {},
  order = {},
}) {
  const reasons = [];
  const side = String(order.side || "").toUpperCase();
  const confidence = number(decision.confidence);
  const minConfidence = number(policy.min_decision_confidence, 0.7);
  const equity = number(portfolio.equity);
  const currentPositionValue = number(portfolio.current_position_value);
  const orderNotional = number(order.notional);
  const dailyPnl = number(portfolio.daily_pnl);
  const drawdownPct = number(portfolio.drawdown_pct);

  if (!["BUY", "SELL"].includes(String(decision.action || "").toUpperCase())) {
    reasons.push("Decision action is not executable.");
  }
  if (confidence < minConfidence) {
    reasons.push(`Decision confidence ${confidence.toFixed(3)} is below minimum ${minConfidence.toFixed(3)}.`);
  }
  if (!(orderNotional > 0)) {
    reasons.push("Order notional must be greater than zero.");
  }
  if (number(policy.max_order_notional) > 0 && orderNotional > number(policy.max_order_notional)) {
    reasons.push("Order notional exceeds the configured maximum.");
  }
  if (equity > 0) {
    const projectedPct = ((currentPositionValue + (side === "BUY" ? orderNotional : -orderNotional)) / equity) * 100;
    if (side === "BUY" && projectedPct > number(policy.max_position_pct, 10)) {
      reasons.push("Projected position size exceeds the configured portfolio percentage limit.");
    }
    const dailyLossPct = dailyPnl < 0 ? Math.abs(dailyPnl / equity) * 100 : 0;
    if (side === "BUY" && dailyLossPct >= number(policy.max_daily_loss_pct, 2)) {
      reasons.push("Daily loss limit has been reached.");
    }
  }

  if (side === "BUY" && drawdownPct >= number(policy.max_portfolio_drawdown_pct, 10)) {
    reasons.push("Portfolio drawdown limit has been reached.");
  }
  if (policy.live_execution_enabled === true) {
    reasons.push("Markets v1 forbids live execution.");
  }

  return {
    approved: reasons.length === 0,
    status: reasons.length === 0 ? "APPROVED_PAPER" : "REJECTED",
    reasons,
    snapshot: {
      confidence,
      min_confidence: minConfidence,
      order_notional: orderNotional,
      equity,
      current_position_value: currentPositionValue,
      daily_pnl: dailyPnl,
      drawdown_pct: drawdownPct,
      evaluated_at: new Date().toISOString(),
      execution_mode: "PAPER",
      side,
    },
  };
}

export default evaluatePaperTradeRisk;
