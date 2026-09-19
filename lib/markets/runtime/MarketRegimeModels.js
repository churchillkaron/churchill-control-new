function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values = []) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (!rows.length) return null;
  return rows.reduce((sum, value) => sum + value, 0) / rows.length;
}

function standardDeviation(values = []) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (rows.length < 2) return null;
  const avg = mean(rows);
  const variance = rows.reduce(
    (sum, value) => sum + ((value - avg) ** 2),
    0,
  ) / (rows.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function sortedCloses(bars = []) {
  return [...(Array.isArray(bars) ? bars : [])]
    .map((bar) => ({
      time: new Date(bar?.bar_time || bar?.t || 0).getTime(),
      close: number(bar?.close),
    }))
    .filter((row) => Number.isFinite(row.time) && row.close > 0)
    .sort((left, right) => left.time - right.time);
}

export function classifyMarketRegime({ bars = [] } = {}) {
  const rows = sortedCloses(bars);
  if (rows.length < 61) {
    return {
      regime: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      metrics: {
        observations: rows.length,
      },
      specialist_weight_multipliers: {
        TECHNICAL: 1,
        QUANT: 1,
        NEWS: 1,
        FUNDAMENTAL: 1,
      },
      sizing_scale: 1,
    };
  }

  const closes = rows.map((row) => row.close);
  const returns = [];
  for (let index = 1; index < closes.length; index += 1) {
    returns.push((closes[index] - closes[index - 1]) / closes[index - 1]);
  }

  const latest = closes.at(-1);
  const ma20 = mean(closes.slice(-20));
  const ma60 = mean(closes.slice(-60));
  const close20 = closes.at(-21);
  const return20 = close20 > 0 ? (latest - close20) / close20 : 0;
  const vol20 = standardDeviation(returns.slice(-20));
  const annualizedVolatilityPct = vol20 === null ? null : vol20 * Math.sqrt(252) * 100;
  const trendSpreadPct = ma60 > 0 ? ((ma20 - ma60) / ma60) * 100 : 0;

  let regime = "NEUTRAL";
  let confidence = 0.55;
  let specialistWeightMultipliers = {
    TECHNICAL: 1,
    QUANT: 1,
    NEWS: 1,
    FUNDAMENTAL: 1,
  };
  let sizingScale = 0.9;

  if (
    (annualizedVolatilityPct !== null && annualizedVolatilityPct >= 35) ||
    (return20 <= -0.08 && trendSpreadPct < 0)
  ) {
    regime = "HIGH_VOL_RISK_OFF";
    confidence = Math.min(
      0.95,
      0.65 + Math.min(Math.abs(return20) * 1.5, 0.15)
        + Math.min(Math.max((annualizedVolatilityPct || 35) - 35, 0) / 100, 0.15),
    );
    specialistWeightMultipliers = {
      TECHNICAL: 0.8,
      QUANT: 1.05,
      NEWS: 1.2,
      FUNDAMENTAL: 0.8,
    };
    sizingScale = 0.5;
  } else if (trendSpreadPct < -1 && return20 < 0) {
    regime = "RISK_OFF";
    confidence = Math.min(0.9, 0.6 + Math.min(Math.abs(trendSpreadPct) / 10, 0.2));
    specialistWeightMultipliers = {
      TECHNICAL: 0.9,
      QUANT: 1.1,
      NEWS: 1.1,
      FUNDAMENTAL: 0.9,
    };
    sizingScale = 0.7;
  } else if (trendSpreadPct > 1 && return20 > 0) {
    regime = "RISK_ON";
    confidence = Math.min(0.9, 0.6 + Math.min(trendSpreadPct / 10, 0.2));
    specialistWeightMultipliers = {
      TECHNICAL: 1.1,
      QUANT: 1.1,
      NEWS: 0.9,
      FUNDAMENTAL: 1,
    };
    sizingScale = 1;
  }

  return {
    regime,
    confidence,
    metrics: {
      observations: rows.length,
      latest_close: latest,
      ma20,
      ma60,
      twenty_day_return: return20,
      annualized_volatility_pct: annualizedVolatilityPct,
      trend_spread_pct: trendSpreadPct,
    },
    specialist_weight_multipliers: specialistWeightMultipliers,
    sizing_scale: sizingScale,
  };
}
