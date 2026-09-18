function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbol(value) {
  return String(value || "").trim().toUpperCase();
}

export function evaluateOpenPositionLimit({
  action,
  positions = [],
  proposedSymbol,
  policy = {},
}) {
  const side = symbol(action);
  const candidate = symbol(proposedSymbol);
  const openSymbols = new Set(
    (Array.isArray(positions) ? positions : [])
      .filter((row) => number(row?.quantity, 0) > 0)
      .map((row) => symbol(row?.symbol))
      .filter(Boolean),
  );
  const maxOpenPositions = Math.max(
    1,
    Math.floor(number(policy.max_open_positions, 20)),
  );
  const createsNewPosition = side === "BUY" && candidate && !openSymbols.has(candidate);
  const projectedOpenPositions = openSymbols.size + (createsNewPosition ? 1 : 0);
  const reasons = [];

  if (side === "BUY" && projectedOpenPositions > maxOpenPositions) {
    reasons.push("Projected open-position count exceeds the configured portfolio limit.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      open_positions: openSymbols.size,
      projected_open_positions: projectedOpenPositions,
      max_open_positions: maxOpenPositions,
      creates_new_position: Boolean(createsNewPosition),
      authority_effect: "PAPER_ONLY",
    },
  };
}

export function summarizeClosedSellOrders(fills = []) {
  const grouped = new Map();

  for (const fill of Array.isArray(fills) ? fills : []) {
    if (symbol(fill?.side) !== "SELL") continue;
    const orderId = String(fill?.order_id || "").trim();
    const realized = number(fill?.metadata?.realized_pnl_delta);
    const time = new Date(fill?.filled_at || 0).getTime();
    if (!orderId || realized === null || !Number.isFinite(time) || time <= 0) continue;

    const current = grouped.get(orderId) || {
      order_id: orderId,
      realized_pnl_delta: 0,
      last_fill_time_ms: 0,
      fill_count: 0,
    };
    current.realized_pnl_delta += realized;
    current.last_fill_time_ms = Math.max(current.last_fill_time_ms, time);
    current.fill_count += 1;
    grouped.set(orderId, current);
  }

  return [...grouped.values()]
    .sort((left, right) => right.last_fill_time_ms - left.last_fill_time_ms)
    .map((row) => ({
      ...row,
      last_fill_at: new Date(row.last_fill_time_ms).toISOString(),
      outcome: row.realized_pnl_delta < 0
        ? "LOSS"
        : row.realized_pnl_delta > 0
          ? "WIN"
          : "FLAT",
    }));
}

export function evaluateSymbolLossReentryLockout({
  action,
  proposedSymbol,
  fills = [],
  policy = {},
  now = new Date(),
}) {
  const side = symbol(action);
  const candidate = symbol(proposedSymbol);
  const cooloffHours = Math.max(
    1,
    number(policy.loss_reentry_cooloff_hours, 24),
  );
  const symbolFills = (Array.isArray(fills) ? fills : [])
    .filter((row) => symbol(row?.symbol) === candidate);
  const closes = summarizeClosedSellOrders(symbolFills);
  const latestClose = closes[0] || null;
  const latestLoss = latestClose?.outcome === "LOSS";
  const latestCloseMs = latestClose
    ? new Date(latestClose.last_fill_at).getTime()
    : null;
  const unlockMs = latestLoss && Number.isFinite(latestCloseMs)
    ? latestCloseMs + (cooloffHours * 60 * 60 * 1000)
    : null;
  const nowMs = new Date(now).getTime();
  const lockoutActive = (
    side === "BUY" &&
    latestLoss &&
    Number.isFinite(unlockMs) &&
    Number.isFinite(nowMs) &&
    nowMs < unlockMs
  );
  const reasons = [];

  if (lockoutActive) {
    reasons.push("Recent realized loss on this symbol requires a re-entry cool-off before another BUY.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      symbol: candidate,
      latest_close_outcome: latestClose?.outcome || null,
      latest_close_realized_pnl: latestClose?.realized_pnl_delta ?? null,
      latest_close_at: latestClose?.last_fill_at || null,
      loss_reentry_cooloff_hours: cooloffHours,
      lockout_active: lockoutActive,
      reentry_allowed_at: unlockMs ? new Date(unlockMs).toISOString() : null,
      authority_effect: "PAPER_ONLY",
    },
  };
}

export function evaluateLossStreakCooloff({
  action,
  fills = [],
  policy = {},
  now = new Date(),
}) {
  const side = symbol(action);
  const maxLosses = Math.max(
    1,
    Math.floor(number(policy.max_consecutive_losing_closes, 3)),
  );
  const cooloffHours = Math.max(
    1,
    number(policy.loss_streak_cooloff_hours, 24),
  );
  const closes = summarizeClosedSellOrders(fills);

  let consecutiveLosses = 0;
  for (const close of closes) {
    if (close.outcome !== "LOSS") break;
    consecutiveLosses += 1;
  }

  const latestClose = closes[0] || null;
  const latestLossTime = latestClose?.outcome === "LOSS"
    ? new Date(latestClose.last_fill_at).getTime()
    : null;
  const cooloffUntilMs = latestLossTime
    ? latestLossTime + (cooloffHours * 60 * 60 * 1000)
    : null;
  const nowMs = new Date(now).getTime();
  const cooloffActive = (
    consecutiveLosses >= maxLosses &&
    Number.isFinite(cooloffUntilMs) &&
    Number.isFinite(nowMs) &&
    nowMs < cooloffUntilMs
  );
  const reasons = [];

  if (side === "BUY" && cooloffActive) {
    reasons.push("Recent consecutive losing closes require a strategy cool-off before new BUY exposure.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      consecutive_losing_closes: consecutiveLosses,
      max_consecutive_losing_closes: maxLosses,
      loss_streak_cooloff_hours: cooloffHours,
      cooloff_active: cooloffActive,
      cooloff_until: cooloffUntilMs ? new Date(cooloffUntilMs).toISOString() : null,
      latest_close_outcome: latestClose?.outcome || null,
      latest_close_realized_pnl: latestClose?.realized_pnl_delta ?? null,
      evaluated_closed_sell_orders: closes.length,
      authority_effect: "PAPER_ONLY",
    },
  };
}
