function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function evaluationHorizonDays(decision) {
  const explicit = number(decision?.decision_payload?.evaluation_horizon_days);
  if (explicit && explicit > 0) return explicit;

  const horizon = String(decision?.horizon || "").toUpperCase();
  if (horizon === "SHORT" || horizon === "1D") return 1;
  if (horizon === "LONG" || horizon === "30D") return 30;
  return 5;
}

export function targetEvaluationTime(decision) {
  const reference = decision?.reference_time || decision?.created_at;
  const referenceMs = new Date(reference).getTime();
  if (!Number.isFinite(referenceMs)) throw new Error("decision reference time required");
  return new Date(referenceMs + (evaluationHorizonDays(decision) * 24 * 60 * 60 * 1000)).toISOString();
}

export function scorePredictionOutcome({ decision, observedPrice, evaluationTime }) {
  const entryPrice = number(decision?.reference_price);
  const observed = number(observedPrice);
  const probabilityUp = number(decision?.probability_up);
  if (!(entryPrice > 0) || !(observed > 0)) throw new Error("prediction prices must be greater than zero");
  if (!(probabilityUp >= 0 && probabilityUp <= 1)) throw new Error("probability_up must be between zero and one");

  const realizedReturn = (observed - entryPrice) / entryPrice;
  const observedUp = realizedReturn > 0 ? 1 : 0;
  const probability = clamp(probabilityUp, 1e-6, 1 - 1e-6);
  const squaredError = (probability - observedUp) ** 2;
  const logLoss = -((observedUp * Math.log(probability)) + ((1 - observedUp) * Math.log(1 - probability)));

  const action = String(decision?.action || "").toUpperCase();
  const predictedDirection = action === "BUY"
    ? "UP"
    : action === "SELL"
      ? "DOWN"
      : action === "HOLD"
        ? "FLAT"
        : "UNKNOWN";
  const directionalHit = action === "BUY"
    ? realizedReturn > 0
    : action === "SELL"
      ? realizedReturn < 0
      : null;

  return {
    symbol: String(decision?.symbol || "").toUpperCase(),
    horizon: String(decision?.horizon || "MEDIUM").toUpperCase(),
    prediction_time: decision.reference_time || decision.created_at,
    evaluation_time: evaluationTime,
    entry_price: entryPrice,
    observed_price: observed,
    predicted_direction: predictedDirection,
    realized_return: realizedReturn,
    directional_hit: directionalHit,
    squared_error: squaredError,
    log_loss: logLoss,
    benchmark_return: null,
    excess_return: null,
    outcome_payload: {
      probability_up: probabilityUp,
      observed_up: Boolean(observedUp),
      action,
      evaluation_horizon_days: evaluationHorizonDays(decision),
    },
  };
}
