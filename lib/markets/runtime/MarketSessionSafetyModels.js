function clean(value) {
  return String(value ?? "").trim();
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
