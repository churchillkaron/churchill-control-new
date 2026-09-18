function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pctReturn(start, end) {
  const a = number(start);
  const b = number(end);
  if (!(a > 0) || b === null) return null;
  return (b - a) / a;
}

function standardDeviation(values) {
  const rows = values.filter((value) => Number.isFinite(value));
  if (rows.length < 2) return null;
  const mean = rows.reduce((sum, value) => sum + value, 0) / rows.length;
  const variance = rows.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (rows.length - 1);
  return Math.sqrt(variance);
}

function sortedBars(bars) {
  return [...(Array.isArray(bars) ? bars : [])]
    .filter((bar) => number(bar?.close) !== null)
    .sort((left, right) => new Date(left.bar_time || left.t) - new Date(right.bar_time || right.t));
}

function priceReturns(bars) {
  const rows = sortedBars(bars);
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const value = pctReturn(rows[index - 1].close, rows[index].close);
    if (value !== null) returns.push(value);
  }
  return returns;
}

function stanceFromScore(score, threshold = 0.15) {
  if (score > threshold) return "BULLISH";
  if (score < -threshold) return "BEARISH";
  return "NEUTRAL";
}

export function buildTechnicalThesis({ symbol, bars }) {
  const rows = sortedBars(bars);
  if (rows.length < 21) {
    return {
      symbol,
      agent_type: "TECHNICAL",
      horizon: "SHORT",
      stance: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      expected_return: null,
      downside_risk: null,
      rationale: { reason: "At least 21 bars are required for technical comparison." },
    };
  }

  const latest = rows.at(-1);
  const close5 = rows.at(-6)?.close;
  const close20 = rows.at(-21)?.close;
  const ret5 = pctReturn(close5, latest.close);
  const ret20 = pctReturn(close20, latest.close);
  const score = (number(ret5, 0) * 0.55) + (number(ret20, 0) * 0.45);
  const confidence = clamp(0.5 + Math.min(Math.abs(score) * 5, 0.4), 0, 0.9);

  return {
    symbol,
    agent_type: "TECHNICAL",
    horizon: "SHORT",
    stance: stanceFromScore(score, 0.01),
    confidence,
    expected_return: score,
    downside_risk: null,
    rationale: {
      five_bar_return: ret5,
      twenty_bar_return: ret20,
      latest_close: number(latest.close),
      method: "bounded momentum blend",
    },
  };
}

export function buildQuantThesis({ symbol, bars }) {
  const rows = sortedBars(bars);
  const returns = priceReturns(rows);
  if (returns.length < 20) {
    return {
      symbol,
      agent_type: "QUANT",
      horizon: "MEDIUM",
      stance: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      expected_return: null,
      downside_risk: null,
      rationale: { reason: "At least 20 return observations are required." },
    };
  }

  const recent = returns.slice(-20);
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const volatility = standardDeviation(recent);
  const signalToNoise = volatility && volatility > 0 ? mean / volatility : 0;
  const score = Math.tanh(signalToNoise * 2);
  const confidence = clamp(0.45 + Math.min(Math.abs(signalToNoise) * 0.18, 0.35), 0, 0.85);

  return {
    symbol,
    agent_type: "QUANT",
    horizon: "MEDIUM",
    stance: stanceFromScore(score, 0.12),
    confidence,
    expected_return: mean * 20,
    downside_risk: volatility ? volatility * Math.sqrt(20) : null,
    rationale: {
      mean_daily_return: mean,
      realized_daily_volatility: volatility,
      signal_to_noise: signalToNoise,
      method: "20-observation risk-adjusted momentum",
    },
  };
}

export function buildNewsThesis({ symbol, evidence }) {
  const rows = (Array.isArray(evidence) ? evidence : [])
    .filter((row) => row?.evidence_type === "NEWS" && (!row.symbol || row.symbol === symbol));

  const scored = rows.filter((row) => number(row.sentiment) !== null);
  if (!scored.length) {
    return {
      symbol,
      agent_type: "NEWS",
      horizon: "SHORT",
      stance: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      expected_return: null,
      downside_risk: null,
      rationale: {
        news_count: rows.length,
        reason: rows.length
          ? "News is present but no governed sentiment/materiality score exists yet."
          : "No recent news evidence exists.",
      },
    };
  }

  let weighted = 0;
  let weightTotal = 0;
  for (const row of scored) {
    const materiality = number(row.materiality, 0.5);
    const sentiment = number(row.sentiment, 0);
    const weight = Math.max(materiality, 0.05);
    weighted += sentiment * weight;
    weightTotal += weight;
  }
  const score = weightTotal > 0 ? weighted / weightTotal : 0;
  const confidence = clamp(0.4 + Math.min(weightTotal / 10, 0.4), 0, 0.8);

  return {
    symbol,
    agent_type: "NEWS",
    horizon: "SHORT",
    stance: stanceFromScore(score, 0.12),
    confidence,
    expected_return: null,
    downside_risk: null,
    rationale: {
      scored_news_count: scored.length,
      weighted_sentiment: score,
      weight_total: weightTotal,
    },
  };
}

export function buildFundamentalThesis({ symbol, filings }) {
  const rows = (Array.isArray(filings) ? filings : [])
    .filter((row) => !row.symbol || row.symbol === symbol);

  if (!rows.length) {
    return {
      symbol,
      agent_type: "FUNDAMENTAL",
      horizon: "LONG",
      stance: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      expected_return: null,
      downside_risk: null,
      rationale: { reason: "No SEC filing evidence is available." },
    };
  }

  return {
    symbol,
    agent_type: "FUNDAMENTAL",
    horizon: "LONG",
    stance: "INSUFFICIENT_EVIDENCE",
    confidence: 0,
    expected_return: null,
    downside_risk: null,
    rationale: {
      filing_count: rows.length,
      latest_forms: rows.slice(0, 8).map((row) => row.form_type),
      reason: "Filings are indexed, but financial-fact interpretation has not yet been admitted.",
    },
  };
}

function stanceValue(stance) {
  if (stance === "BULLISH") return 1;
  if (stance === "BEARISH") return -1;
  if (stance === "NEUTRAL") return 0;
  return null;
}

export function synthesizeMarketDecision({ symbol, theses, horizon = "MEDIUM" }) {
  const eligible = (Array.isArray(theses) ? theses : [])
    .map((thesis) => ({ ...thesis, stance_value: stanceValue(thesis.stance) }))
    .filter((thesis) => thesis.stance_value !== null && number(thesis.confidence, 0) > 0);

  if (eligible.length < 2) {
    return {
      symbol,
      horizon,
      action: "NO_ACTION",
      confidence: 0,
      expected_return: null,
      downside_risk: null,
      decision_payload: {
        reason: "At least two independent specialist theses are required.",
        specialist_count: eligible.length,
      },
    };
  }

  let weightedScore = 0;
  let weightTotal = 0;
  let expectedReturnWeighted = 0;
  let expectedReturnWeight = 0;
  let downsideWeighted = 0;
  let downsideWeight = 0;

  for (const thesis of eligible) {
    const weight = clamp(number(thesis.confidence, 0), 0, 1);
    weightedScore += thesis.stance_value * weight;
    weightTotal += weight;

    if (number(thesis.expected_return) !== null) {
      expectedReturnWeighted += number(thesis.expected_return) * weight;
      expectedReturnWeight += weight;
    }
    if (number(thesis.downside_risk) !== null) {
      downsideWeighted += number(thesis.downside_risk) * weight;
      downsideWeight += weight;
    }
  }

  const score = weightTotal > 0 ? weightedScore / weightTotal : 0;
  const confidence = clamp(Math.abs(score) * Math.min(weightTotal / 2, 1), 0, 0.95);
  const action = confidence < 0.35
    ? "HOLD"
    : score > 0
      ? "BUY"
      : "SELL";

  return {
    symbol,
    horizon,
    action,
    confidence,
    expected_return: expectedReturnWeight > 0 ? expectedReturnWeighted / expectedReturnWeight : null,
    downside_risk: downsideWeight > 0 ? downsideWeighted / downsideWeight : null,
    decision_payload: {
      ensemble_score: score,
      specialist_count: eligible.length,
      specialist_agents: eligible.map((thesis) => thesis.agent_type),
      method: "confidence-weighted independent specialist ensemble",
    },
  };
}

export function probabilityUpFromDecision({ action, confidence }) {
  const bounded = clamp(number(confidence, 0), 0, 1);
  const normalizedAction = String(action || "").toUpperCase();
  if (normalizedAction === "BUY") return clamp(0.5 + (bounded / 2), 0.5, 0.975);
  if (normalizedAction === "SELL") return clamp(0.5 - (bounded / 2), 0.025, 0.5);
  return 0.5;
}
