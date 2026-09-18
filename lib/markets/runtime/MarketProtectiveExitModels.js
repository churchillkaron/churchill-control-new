function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateProtectiveLevels({
  averageEntryPrice,
  stopLossPct = 5,
  takeProfitPct = 10,
  enabled = true,
}) {
  const entry = number(averageEntryPrice);
  if (!enabled || !(entry > 0)) {
    return {
      enabled: false,
      stop_loss_price: null,
      take_profit_price: null,
    };
  }

  const stopPct = Math.min(50, Math.max(0.01, number(stopLossPct, 5)));
  const takePct = Math.min(200, Math.max(0.01, number(takeProfitPct, 10)));

  return {
    enabled: true,
    stop_loss_price: entry * (1 - (stopPct / 100)),
    take_profit_price: entry * (1 + (takePct / 100)),
  };
}

export function evaluateProtectiveExit({
  position,
  snapshot,
  enabled = true,
}) {
  const quantity = Math.max(0, number(position?.quantity, 0));
  const stop = number(position?.stop_loss_price);
  const take = number(position?.take_profit_price);
  const bid = number(snapshot?.bid_price)
    ?? number(snapshot?.latest_trade_price)
    ?? number(snapshot?.minute_close)
    ?? number(snapshot?.day_close);

  if (!enabled || !(quantity > 0) || !(bid > 0)) {
    return {
      triggered: false,
      reason: null,
      exit_price: bid,
      quantity,
    };
  }

  if (stop > 0 && bid <= stop) {
    return {
      triggered: true,
      reason: "STOP_LOSS",
      exit_price: bid,
      trigger_price: stop,
      quantity,
    };
  }

  if (take > 0 && bid >= take) {
    return {
      triggered: true,
      reason: "TAKE_PROFIT",
      exit_price: bid,
      trigger_price: take,
      quantity,
    };
  }

  return {
    triggered: false,
    reason: null,
    exit_price: bid,
    quantity,
  };
}
