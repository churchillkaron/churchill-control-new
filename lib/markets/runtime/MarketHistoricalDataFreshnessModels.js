function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbol(value) {
  return String(value || "").trim().toUpperCase();
}

export function evaluateHistoricalDataFreshness({
  action,
  requiredSymbols = [],
  barsBySymbol = {},
  policy = {},
  now = new Date(),
}) {
  const side = symbol(action);
  const maxAgeHours = Math.max(
    24,
    number(policy.max_daily_bar_age_hours, 120),
  );
  const nowMs = new Date(now).getTime();
  const rows = [];
  const staleSymbols = [];

  for (const rawSymbol of requiredSymbols) {
    const ticker = symbol(rawSymbol);
    if (!ticker) continue;
    const bars = Array.isArray(barsBySymbol[ticker])
      ? barsBySymbol[ticker]
      : [];
    const latest = [...bars]
      .map((row) => ({
        time: new Date(row?.bar_time || 0).getTime(),
        bar_time: row?.bar_time || null,
      }))
      .filter((row) => Number.isFinite(row.time) && row.time > 0)
      .sort((left, right) => right.time - left.time)[0] || null;

    const ageHours = latest && Number.isFinite(nowMs)
      ? Math.max(0, (nowMs - latest.time) / (60 * 60 * 1000))
      : null;
    const fresh = latest !== null && ageHours !== null && ageHours <= maxAgeHours;

    rows.push({
      symbol: ticker,
      latest_bar_time: latest?.bar_time || null,
      age_hours: ageHours,
      fresh,
    });

    if (!fresh) staleSymbols.push(ticker);
  }

  const reasons = [];
  if (side === "BUY" && staleSymbols.length > 0) {
    reasons.push("Required daily-bar evidence is missing or stale for new BUY exposure.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    metrics: {
      max_daily_bar_age_hours: maxAgeHours,
      required_symbols: rows.length,
      stale_symbols: staleSymbols,
      symbols: rows,
      authority_effect: "PAPER_ONLY",
    },
  };
}
