function clean(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateTradingClockIntegrity({
  clock,
  now = new Date(),
  maxAgeSeconds = 120,
}) {
  const reasons = [];
  const nowMs = new Date(now).getTime();
  const clockMs = timestamp(clock?.timestamp);
  const fetchedMs = timestamp(clock?.provenance?.fetched_at);
  const nextOpenMs = timestamp(clock?.next_open);
  const nextCloseMs = timestamp(clock?.next_close);
  const maxAgeMs = Math.max(1, Number(maxAgeSeconds) || 120) * 1000;

  if (clockMs === null) reasons.push("Trading clock timestamp is unavailable.");
  if (fetchedMs === null) reasons.push("Trading clock fetch timestamp is unavailable.");
  if (clockMs !== null && Math.abs(nowMs - clockMs) > maxAgeMs) {
    reasons.push("Trading clock timestamp is stale.");
  }
  if (fetchedMs !== null && Math.abs(nowMs - fetchedMs) > maxAgeMs) {
    reasons.push("Trading clock metadata fetch is stale.");
  }
  if (clock?.is_open === true) {
    if (nextCloseMs === null) reasons.push("Open trading clock next close is unavailable.");
    if (clockMs !== null && nextCloseMs !== null && nextCloseMs <= clockMs) {
      reasons.push("Open trading clock next close is not after the clock timestamp.");
    }
  } else {
    if (nextOpenMs === null) reasons.push("Closed trading clock next open is unavailable.");
    if (clockMs !== null && nextOpenMs !== null && nextOpenMs <= clockMs) {
      reasons.push("Closed trading clock next open is not after the clock timestamp.");
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      clock_timestamp: clock?.timestamp || null,
      fetched_at: clock?.provenance?.fetched_at || null,
      next_open: clock?.next_open || null,
      next_close: clock?.next_close || null,
      max_age_seconds: Math.max(1, Number(maxAgeSeconds) || 120),
    },
  };
}

export function evaluateMarketSessionSafety({
  clock,
  asset,
  allowExtendedHours = false,
}) {
  const reasons = [];
  const status = clean(asset?.status).toLowerCase();

  if (!asset) reasons.push("Trading asset metadata is unavailable.");
  if (asset && status !== "active") reasons.push("Asset is not active.");
  if (asset && asset.tradable !== true) reasons.push("Asset is not marked tradable.");
  if (asset?.overnight_halted === true) reasons.push("Asset is halted for overnight trading.");

  if (!clock) {
    reasons.push("Authoritative market clock is unavailable.");
  } else if (clock.is_open !== true) {
    if (!allowExtendedHours) {
      reasons.push("Regular US equity market session is closed.");
    } else if (asset?.overnight_tradable !== true) {
      reasons.push("Extended-hours PAPER execution is enabled but asset is not overnight tradable.");
    } else if (asset?.overnight_halted === true) {
      reasons.push("Asset is halted during the overnight session.");
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      session_open: clock?.is_open === true,
      allow_extended_hours: allowExtendedHours === true,
      asset_status: status || null,
      asset_tradable: asset?.tradable === true,
      overnight_tradable: asset?.overnight_tradable === true,
      overnight_halted: asset?.overnight_halted === true,
      next_open: clock?.next_open || null,
      next_close: clock?.next_close || null,
      coverage: "ALPACA_TRADING_METADATA",
    },
  };
}
