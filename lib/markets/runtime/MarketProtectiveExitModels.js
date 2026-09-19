function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ageDays(value, now = new Date()) {
  const started = new Date(value || 0).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(current) || started <= 0) {
    return null;
  }
  return Math.max(0, (current - started) / (24 * 60 * 60 * 1000));
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

export function trailingStopLevel({
  averageEntryPrice,
  highWaterPrice,
  fixedStopPrice = null,
  trailingStopPct = 7.5,
  enabled = true,
}) {
  const entry = number(averageEntryPrice);
  const highWater = number(highWaterPrice);
  const fixedStop = number(fixedStopPrice);
  const trailPct = Math.min(50, Math.max(0.01, number(trailingStopPct, 7.5)));

  if (!enabled || !(entry > 0) || !(highWater > entry)) {
    return null;
  }

  const trailing = highWater * (1 - (trailPct / 100));
  if (fixedStop !== null && trailing <= fixedStop) {
    return null;
  }
  return trailing;
}

export function evaluateProtectiveExit({
  position,
  snapshot,
  enabled = true,
  trailingStopEnabled = true,
  trailingStopPct = 7.5,
  timeExitEnabled = true,
  maxHoldingDays = 30,
  now = new Date(),
}) {
  const quantity = Math.max(0, number(position?.quantity, 0));
  const stop = number(position?.stop_loss_price);
  const take = number(position?.take_profit_price);
  const bid = number(snapshot?.bid_price)
    ?? number(snapshot?.latest_trade_price)
    ?? number(snapshot?.minute_close)
    ?? number(snapshot?.day_close);
  const holdingDays = ageDays(position?.opened_at, now);
  const maxDays = Math.max(1, number(maxHoldingDays, 30));
  const trailingStop = trailingStopLevel({
    averageEntryPrice: position?.average_entry_price,
    highWaterPrice: position?.high_water_price,
    fixedStopPrice: stop,
    trailingStopPct,
    enabled: trailingStopEnabled,
  });

  if (!enabled || !(quantity > 0) || !(bid > 0)) {
    return {
      triggered: false,
      reason: null,
      exit_price: bid,
      quantity,
      trailing_stop_price: trailingStop,
      holding_days: holdingDays,
    };
  }

  if (stop > 0 && bid <= stop) {
    return {
      triggered: true,
      reason: "STOP_LOSS",
      exit_price: bid,
      trigger_price: stop,
      quantity,
      trailing_stop_price: trailingStop,
      holding_days: holdingDays,
    };
  }

  if (trailingStop > 0 && bid <= trailingStop) {
    return {
      triggered: true,
      reason: "TRAILING_STOP",
      exit_price: bid,
      trigger_price: trailingStop,
      quantity,
      trailing_stop_price: trailingStop,
      holding_days: holdingDays,
    };
  }

  if (take > 0 && bid >= take) {
    return {
      triggered: true,
      reason: "TAKE_PROFIT",
      exit_price: bid,
      trigger_price: take,
      quantity,
      trailing_stop_price: trailingStop,
      holding_days: holdingDays,
    };
  }

  if (timeExitEnabled && holdingDays !== null && holdingDays >= maxDays) {
    return {
      triggered: true,
      reason: "MAX_HOLDING_PERIOD",
      exit_price: bid,
      trigger_price: null,
      quantity,
      trailing_stop_price: trailingStop,
      holding_days: holdingDays,
      max_holding_days: maxDays,
    };
  }

  return {
    triggered: false,
    reason: null,
    exit_price: bid,
    quantity,
    trailing_stop_price: trailingStop,
    holding_days: holdingDays,
  };
}
