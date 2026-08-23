import {
  normalizeOperatorPredictionAccountability,
  operatorPredictionAccountabilitySummary,
} from "@/lib/operator/contracts/OperatorPredictionAccountability";

const PATTERNS = [
  /\bhow accurate\b.*\b(prediction|predictions|forecast|forecasts)\b/i,
  /\b(prediction|predictions|forecast|forecasts)\b.*\b(accuracy|accurate|track record|right|wrong|miss|missed|misses|calibrat|overconfident|underconfident|brier)\b/i,
  /\b(forecast track record|prediction track record|forecast accuracy|prediction accuracy|brier score)\b/i,
  /\b(what did you get wrong|what have you got wrong|what were you wrong about|what did you miss|where were you wrong)\b/i,
  /\b(what did you get right|what have you got right|what were you right about|where were you right)\b/i,
  /\b(are you|have you been)\s+(overconfident|underconfident|calibrated|well calibrated)\b/i,
  /\b(how well calibrated are you|show me your calibration|show me the calibration)\b/i,
];

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function normalized(value) {
  return text(value, 500)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : null;
}
function points(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(Math.abs(number) * 100)} percentage points` : null;
}
function decimal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : null;
}
function plural(count, singular, pluralForm = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralForm;
}
function sampleCaveat(scored) {
  if (scored <= 0) return "";
  if (scored < 5) return " That is still too small a sample for a strong calibration claim.";
  if (scored < 10) return " The sample is still small, so I would treat the rate as provisional.";
  return "";
}
function recentResolved(state, resolution, limit = 3) {
  return [...list(state?.history)]
    .reverse()
    .filter((item) => text(item?.resolution, 40).toLowerCase() === resolution)
    .slice(0, limit);
}
function noScoredReply(summary) {
  const open = Number(summary?.open_predictions || 0);
  const inconclusive = Number(summary?.inconclusive || 0);
  const unscored = Number(summary?.unscored_outlook_count || 0);
  const details = [];
  if (open) details.push(`${open} open ${plural(open, "forecast")}`);
  if (inconclusive) details.push(`${inconclusive} inconclusive ${plural(inconclusive, "resolution")}`);
  if (unscored) details.push(`${unscored} unscored outlook ${plural(unscored, "item")}`);
  return [
    "I do not have enough resolved scored forecasts to claim an accuracy rate yet.",
    details.length ? `The recent ledger currently has ${details.join(", ")}.` : "The scored forecast ledger is still empty.",
    "I only count a forecast after its evaluation horizon is reached and the deterministic verification rule resolves it.",
  ].join(" ");
}
function missesReply(state, summary) {
  const misses = recentResolved(state, "contradicted", 3);
  const contradicted = Number(summary?.contradicted || 0);
  const scored = Number(summary?.scored_resolved || 0);
  if (!misses.length) {
    return scored
      ? `I have no contradicted scored forecasts in the recent ledger. ${Number(summary.confirmed || 0)} of ${scored} scored forecasts were confirmed.${sampleCaveat(scored)}`
      : noScoredReply(summary);
  }
  const examples = misses.map((item) => `“${text(item.prediction, 220)}”`).join("; ");
  return `I got ${contradicted} of ${scored} scored ${plural(scored, "forecast")} wrong in the recent ledger. ${misses.length === 1 ? "The most recent miss was" : "Recent misses were"}: ${examples}.${sampleCaveat(scored)}`;
}
function winsReply(state, summary) {
  const wins = recentResolved(state, "confirmed", 3);
  const confirmed = Number(summary?.confirmed || 0);
  const scored = Number(summary?.scored_resolved || 0);
  if (!wins.length) {
    return scored
      ? `I do not have a confirmed scored forecast in the recent ledger. ${Number(summary.contradicted || 0)} of ${scored} scored forecasts were contradicted.${sampleCaveat(scored)}`
      : noScoredReply(summary);
  }
  const examples = wins.map((item) => `“${text(item.prediction, 220)}”`).join("; ");
  return `${confirmed} of ${scored} scored ${plural(scored, "forecast")} were confirmed. ${wins.length === 1 ? "The most recent confirmed forecast was" : "Recent confirmed forecasts were"}: ${examples}.${sampleCaveat(scored)}`;
}
function calibrationReply(summary, direct = false) {
  const scored = Number(summary?.scored_resolved || 0);
  if (!scored) return noScoredReply(summary);
  const hitRate = Number(summary?.observed_success_rate);
  const confidence = Number(summary?.mean_confidence);
  if (!Number.isFinite(hitRate) || !Number.isFinite(confidence)) {
    return `I have ${scored} scored ${plural(scored, "forecast")}, but not enough confidence data to judge calibration yet.${sampleCaveat(scored)}`;
  }
  const delta = confidence - hitRate;
  const direction = delta > 0.05 ? "overconfident" : delta < -0.05 ? "underconfident" : "roughly calibrated";
  const brier = decimal(summary?.brier_score);
  const comparison = `${percent(confidence)} mean stated confidence versus ${percent(hitRate)} observed success`;
  const gap = points(delta);
  const scoreText = brier ? ` My Brier score is ${brier}; lower is better.` : "";
  if (direct) {
    return direction === "roughly calibrated"
      ? `On the recent scored record, I look roughly calibrated: ${comparison}.${scoreText}${sampleCaveat(scored)}`
      : `On the recent scored record, I have been ${direction} by about ${gap}: ${comparison}.${scoreText}${sampleCaveat(scored)}`;
  }
  return `Across ${scored} scored ${plural(scored, "forecast")}, observed success is ${percent(hitRate)} and mean stated confidence is ${percent(confidence)}. That makes the recent record ${direction}${gap ? ` by about ${gap}` : ""}.${scoreText}${sampleCaveat(scored)}`;
}
function trackRecordReply(summary) {
  const scored = Number(summary?.scored_resolved || 0);
  if (!scored) return noScoredReply(summary);
  const confirmed = Number(summary?.confirmed || 0);
  const contradicted = Number(summary?.contradicted || 0);
  const inconclusive = Number(summary?.inconclusive || 0);
  const superseded = Number(summary?.superseded || 0);
  const open = Number(summary?.open_predictions || 0);
  const rate = percent(summary?.observed_success_rate);
  const confidence = percent(summary?.mean_confidence);
  const gap = points(summary?.calibration_gap);
  const brier = decimal(summary?.brier_score);
  return [
    `My recent scored forecast record is ${confirmed} confirmed and ${contradicted} contradicted out of ${scored}, an observed success rate of ${rate}.`,
    confidence ? `Mean stated confidence is ${confidence}${gap ? ` with a ${gap} calibration gap` : ""}.` : null,
    brier ? `Brier score is ${brier}; lower is better.` : null,
    `There are also ${inconclusive} inconclusive, ${superseded} superseded, and ${open} currently open ${plural(open, "forecast")}.`,
    sampleCaveat(scored).trim() || null,
  ].filter(Boolean).join(" ");
}

export function isForecastAccountabilityQuestion(message) {
  const clean = normalized(message);
  if (!clean || clean.length > 220) return false;
  return PATTERNS.some((pattern) => pattern.test(clean));
}

export function forecastAccountabilityContext(projectState = {}) {
  const accountability = object(projectState?.business_thesis).prediction_accountability;
  const state = normalizeOperatorPredictionAccountability(accountability);
  return {
    summary: operatorPredictionAccountabilitySummary(accountability),
    recent_resolutions: [...list(state?.history)]
      .reverse()
      .filter((item) => item?.resolution && item.resolution !== "superseded")
      .slice(0, 5)
      .map((item) => ({
        prediction: text(item.prediction, 300),
        resolution: text(item.resolution, 40),
        confidence: item.confidence ?? null,
        resolved_at: text(item.resolved_at, 80) || null,
      })),
    evidence_scope: "historical_forecast_accountability_only",
    not_live_business_proof: true,
  };
}

export function forecastAccountabilityReply({ message, projectState = {} } = {}) {
  if (!isForecastAccountabilityQuestion(message)) return null;
  const clean = normalized(message);
  const accountability = object(projectState?.business_thesis).prediction_accountability;
  const state = normalizeOperatorPredictionAccountability(accountability);
  const summary = operatorPredictionAccountabilitySummary(accountability);
  if (/\b(wrong|miss|missed|misses)\b/.test(clean)) return missesReply(state, summary);
  if (/\b(get right|got right|were you right|where were you right)\b/.test(clean)) return winsReply(state, summary);
  if (/\b(overconfident|underconfident|calibrated|calibration|brier)\b/.test(clean)) {
    return calibrationReply(summary, /\b(overconfident|underconfident|are you calibrated|well calibrated)\b/.test(clean));
  }
  return trackRecordReply(summary);
}
