function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluateCashReserve({
  action,
  cashBalance,
  equity,
  proposedNotional = 0,
  policy = {},
}) {
  const side = String(action || "").trim().toUpperCase();
  const cash = Math.max(0, number(cashBalance, 0));
  const accountEquity = Math.max(0, number(equity, 0));
  const notional = side === "BUY"
    ? Math.max(0, number(proposedNotional, 0))
    : 0;
  const minReservePct = Math.max(
    0,
    number(policy.min_cash_reserve_pct, 10),
  );
  const executionBufferBps = Math.max(
    0,
    number(policy.cash_reserve_execution_buffer_bps, 25),
  );
  const bufferedBuyCost = notional * (1 + (executionBufferBps / 10000));
  const projectedCash = side === "BUY"
    ? cash - bufferedBuyCost
    : cash;
  const projectedCashPct = accountEquity > 0
    ? (projectedCash / accountEquity) * 100
    : null;
  const reasons = [];

  if (side === "BUY") {
    if (!(accountEquity > 0)) {
      reasons.push("Portfolio equity must be positive for the cash-reserve gate.");
    } else if (projectedCash < 0) {
      reasons.push("Proposed BUY plus execution buffer exceeds available PAPER cash.");
    } else if (projectedCashPct < minReservePct) {
      reasons.push("Proposed BUY would reduce PAPER cash below the configured reserve.");
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      cash_balance: cash,
      portfolio_equity: accountEquity,
      proposed_buy_notional: notional,
      execution_buffer_bps: executionBufferBps,
      buffered_buy_cost: bufferedBuyCost,
      projected_cash_balance: projectedCash,
      projected_cash_pct_equity: projectedCashPct,
      min_cash_reserve_pct: minReservePct,
      authority_effect: "PAPER_ONLY",
    },
  };
}
