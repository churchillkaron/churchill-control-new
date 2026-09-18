function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluateMarketMicrostructureRisk({
  policy = {},
  snapshot = {},
  side,
  now = new Date(),
}) {
  const reasons = [];
  const normalizedSide = String(side || "").trim().toUpperCase();
  const quoteMs = new Date(snapshot?.latest_quote_at || snapshot?.captured_at || 0).getTime();
  const nowMs = new Date(now).getTime();
  const maxAgeSeconds = number(policy.max_market_data_age_seconds, 120);
  const ageSeconds = Number.isFinite(quoteMs) && Number.isFinite(nowMs)
    ? Math.max(0, (nowMs - quoteMs) / 1000)
    : Number.POSITIVE_INFINITY;

  if (ageSeconds > maxAgeSeconds) {
    reasons.push("Authoritative market data is stale.");
  }

  const bid = number(snapshot?.bid_price);
  const ask = number(snapshot?.ask_price);
  const bidSize = number(snapshot?.bid_size, 0);
  const askSize = number(snapshot?.ask_size, 0);

  let spreadBps = null;
  if (bid !== null && ask !== null) {
    if (!(bid > 0) || !(ask > 0) || ask < bid) {
      reasons.push("Authoritative quote is invalid or crossed.");
    } else {
      const midpoint = (bid + ask) / 2;
      spreadBps = midpoint > 0 ? ((ask - bid) / midpoint) * 10000 : null;
    }
  } else if (normalizedSide === "BUY") {
    reasons.push("A bid-ask quote is required for new exposure.");
  }

  const maxSpreadBps = number(policy.max_spread_bps, 50);
  if (
    normalizedSide === "BUY" &&
    spreadBps !== null &&
    spreadBps > maxSpreadBps
  ) {
    reasons.push("Bid-ask spread exceeds the configured execution limit.");
  }

  const minQuoteNotional = Math.max(0, number(policy.min_quote_notional, 0));
  const displayedNotional = normalizedSide === "BUY"
    ? (ask && askSize ? ask * askSize : 0)
    : (bid && bidSize ? bid * bidSize : 0);

  if (
    normalizedSide === "BUY" &&
    minQuoteNotional > 0 &&
    displayedNotional < minQuoteNotional
  ) {
    reasons.push("Displayed ask liquidity is below the configured minimum.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      market_data_age_seconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
      max_market_data_age_seconds: maxAgeSeconds,
      bid_price: bid,
      ask_price: ask,
      spread_bps: spreadBps,
      max_spread_bps: maxSpreadBps,
      displayed_quote_notional: displayedNotional,
      min_quote_notional: minQuoteNotional,
      side: normalizedSide,
    },
  };
}
