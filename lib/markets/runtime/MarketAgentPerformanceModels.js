function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function thesisProbabilityUp({ stance, confidence }) {
  const bounded = clamp(number(confidence, 0), 0, 1);
  const normalized = String(stance || "").trim().toUpperCase();
  if (normalized === "BULLISH") return clamp(0.5 + (bounded / 2), 0.5, 0.975);
  if (normalized === "BEARISH") return clamp(0.5 - (bounded / 2), 0.025, 0.5);
  return 0.5;
}

export function scoreAgentThesisOutcome({
  thesis,
  decision,
  outcome,
}) {
  const stance = String(thesis?.stance || "").trim().toUpperCase();
  if (!["BULLISH", "BEARISH", "NEUTRAL"].includes(stance)) return null;

  const realizedReturn = number(outcome?.realized_return);
  if (realizedReturn === null) return null;

  const probabilityUp = thesisProbabilityUp({
    stance,
    confidence: thesis?.confidence,
  });
  const observedUp = realizedReturn > 0 ? 1 : 0;
  const probability = clamp(probabilityUp, 1e-6, 1 - 1e-6);
  const squaredError = (probability - observedUp) ** 2;
  const logLoss = -(
    (observedUp * Math.log(probability)) +
    ((1 - observedUp) * Math.log(1 - probability))
  );

  const directionalHit = stance === "BULLISH"
    ? realizedReturn > 0
    : stance === "BEARISH"
      ? realizedReturn < 0
      : null;
  const signedReturn = stance === "BULLISH"
    ? realizedReturn
    : stance === "BEARISH"
      ? -realizedReturn
      : null;

  return {
    decision_id: decision?.id || outcome?.decision_id || null,
    thesis_id: thesis?.id || null,
    symbol: String(thesis?.symbol || decision?.symbol || outcome?.symbol || "").toUpperCase(),
    agent_type: String(thesis?.agent_type || "").toUpperCase(),
    stance,
    thesis_confidence: clamp(number(thesis?.confidence, 0), 0, 1),
    prediction_time: decision?.reference_time || decision?.created_at || thesis?.generated_at || null,
    evaluation_time: outcome?.evaluation_time || null,
    realized_return: realizedReturn,
    directional_hit: directionalHit,
    probability_up: probabilityUp,
    squared_error: squaredError,
    log_loss: logLoss,
    signed_return: signedReturn,
  };
}

export function summarizeAgentOutcomes(rows = []) {
  const samples = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const directional = samples.filter((row) => typeof row.directional_hit === "boolean");
  const hits = directional.filter((row) => row.directional_hit === true).length;
  const brierRows = samples.map((row) => number(row.squared_error)).filter((value) => value !== null);
  const logRows = samples.map((row) => number(row.log_loss)).filter((value) => value !== null);
  const signedRows = samples.map((row) => number(row.signed_return)).filter((value) => value !== null);

  const average = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

  return {
    sample_count: samples.length,
    directional_tests: directional.length,
    directional_hit_rate: directional.length ? hits / directional.length : null,
    avg_brier: average(brierRows),
    avg_log_loss: average(logRows),
    avg_signed_return: average(signedRows),
  };
}

export function deriveAgentReliabilityWeight(summary = {}) {
  const sampleCount = Math.max(0, number(summary.sample_count, 0));
  const sampleFactor = Math.min(sampleCount / 30, 1);
  if (sampleFactor <= 0) return 1;

  const hitRate = number(summary.directional_hit_rate, 0.5);
  const brier = number(summary.avg_brier, 0.25);
  const signedReturn = number(summary.avg_signed_return, 0);

  const hitSignal = clamp((hitRate - 0.5) / 0.25, -1, 1);
  const calibrationSignal = clamp((0.25 - brier) / 0.20, -1, 1);
  const returnSignal = clamp(signedReturn / 0.05, -1, 1);

  const qualitySignal =
    (hitSignal * 0.45) +
    (calibrationSignal * 0.35) +
    (returnSignal * 0.20);

  return clamp(1 + (qualitySignal * 0.5 * sampleFactor), 0.5, 1.5);
}
