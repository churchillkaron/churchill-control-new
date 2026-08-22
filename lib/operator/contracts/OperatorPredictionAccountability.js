const HORIZON_MS = Object.freeze({
  immediate: 6 * 60 * 60 * 1000,
  near_term: 3 * 24 * 60 * 60 * 1000,
  this_period: 30 * 24 * 60 * 60 * 1000,
  longer_term: 90 * 24 * 60 * 60 * 1000,
});

const OPERATORS = new Set(["gt", "gte", "lt", "lte", "eq", "neq", "increase", "decrease"]);
const RESOLUTIONS = new Set(["confirmed", "contradicted", "inconclusive", "superseded"]);
const BLOCKED_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_OPEN = 16;
const MAX_HISTORY = 48;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function probability(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}
function scalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return typeof value === "string" ? text(value, 240) : null;
}
function timestamp(value) {
  const parsed = Date.parse(text(value, 80));
  return Number.isFinite(parsed) ? parsed : null;
}
function fnv1a(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function path(value) {
  const normalized = text(value, 240)
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "");
  const segments = normalized.split(".").filter(Boolean);
  if (!segments.length || segments.some((segment) => BLOCKED_PATH_SEGMENTS.has(segment))) return null;
  return segments.join(".");
}
function readPath(value, requestedPath) {
  const safePath = path(requestedPath);
  if (!safePath) return null;
  let current = value;
  for (const segment of safePath.split(".")) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)];
    else if (typeof current === "object" && Object.prototype.hasOwnProperty.call(current, segment)) current = current[segment];
    else return null;
  }
  return scalar(current);
}

export function normalizeOperatorPredictionVerification(value) {
  const source = object(value);
  const operator = text(source.operator, 40).toLowerCase();
  const evidenceRef = text(source.evidence_ref || source.evidence_id, 120);
  const metricPath = path(source.path || source.metric_path || source.field_path);
  if (!evidenceRef || !metricPath || !OPERATORS.has(operator)) return null;
  const target = scalar(source.target_value ?? source.target);
  if (["gt", "gte", "lt", "lte"].includes(operator) && typeof target !== "number") return null;
  if (["eq", "neq"].includes(operator) && target === null) return null;
  return {
    evidence_ref: evidenceRef,
    capability_key: text(source.capability_key, 240) || null,
    path: metricPath,
    operator,
    target_value: ["increase", "decrease"].includes(operator) ? null : target,
  };
}

function normalizeRecord(value) {
  const source = object(value);
  const verification = normalizeOperatorPredictionVerification(source.verification);
  const predictionId = text(source.prediction_id, 120);
  const prediction = text(source.prediction, 700);
  if (!verification || !predictionId || !prediction) return null;
  const resolution = text(source.resolution, 40).toLowerCase();
  return {
    prediction_id: predictionId,
    subject_key: text(source.subject_key, 120) || null,
    prediction,
    horizon: text(source.horizon, 40) || "near_term",
    confidence: probability(source.confidence, null),
    evidence_refs: list(source.evidence_refs).slice(0, 6).map((item) => text(item, 120)).filter(Boolean),
    verification,
    baseline_value: scalar(source.baseline_value),
    created_at: text(source.created_at, 80) || null,
    evaluation_due_at: text(source.evaluation_due_at, 80) || null,
    last_evaluated_at: text(source.last_evaluated_at, 80) || null,
    last_observed_value: scalar(source.last_observed_value),
    status: text(source.status, 40) || "open",
    resolution: RESOLUTIONS.has(resolution) ? resolution : null,
    resolved_at: text(source.resolved_at, 80) || null,
    resolution_evidence_refs: list(source.resolution_evidence_refs).slice(0, 6).map((item) => text(item, 120)).filter(Boolean),
    resolution_value: scalar(source.resolution_value),
    resolution_reason: text(source.resolution_reason, 240) || null,
    last_seen_at: text(source.last_seen_at, 80) || null,
  };
}

function bucket(confidence) {
  const value = probability(confidence, null);
  if (value === null) return "unknown";
  if (value < 0.5) return "0-49";
  if (value < 0.7) return "50-69";
  if (value < 0.85) return "70-84";
  return "85-100";
}
function calibration(history) {
  const scored = history.filter((item) => ["confirmed", "contradicted"].includes(item.resolution));
  const confirmed = scored.filter((item) => item.resolution === "confirmed").length;
  const withConfidence = scored.filter((item) => probability(item.confidence, null) !== null);
  const hitRate = scored.length ? confirmed / scored.length : null;
  const meanConfidence = withConfidence.length
    ? withConfidence.reduce((sum, item) => sum + probability(item.confidence, 0), 0) / withConfidence.length
    : null;
  const brierScore = withConfidence.length
    ? withConfidence.reduce((sum, item) => {
        const p = probability(item.confidence, 0);
        const y = item.resolution === "confirmed" ? 1 : 0;
        return sum + (p - y) ** 2;
      }, 0) / withConfidence.length
    : null;
  const buckets = new Map();
  for (const item of scored) {
    const key = bucket(item.confidence);
    const current = buckets.get(key) || { bucket: key, total: 0, confirmed: 0, confidence_sum: 0, confidence_count: 0 };
    current.total += 1;
    if (item.resolution === "confirmed") current.confirmed += 1;
    const p = probability(item.confidence, null);
    if (p !== null) {
      current.confidence_sum += p;
      current.confidence_count += 1;
    }
    buckets.set(key, current);
  }
  return {
    scored_resolved: scored.length,
    confirmed,
    contradicted: scored.length - confirmed,
    inconclusive: history.filter((item) => item.resolution === "inconclusive").length,
    superseded: history.filter((item) => item.resolution === "superseded").length,
    observed_success_rate: hitRate,
    mean_confidence: meanConfidence,
    calibration_gap: meanConfidence !== null && hitRate !== null ? Math.abs(meanConfidence - hitRate) : null,
    brier_score: brierScore,
    by_confidence_bucket: [...buckets.values()].map((item) => ({
      bucket: item.bucket,
      total: item.total,
      confirmed: item.confirmed,
      observed_success_rate: item.total ? item.confirmed / item.total : null,
      mean_confidence: item.confidence_count ? item.confidence_sum / item.confidence_count : null,
    })),
  };
}

export function normalizeOperatorPredictionAccountability(value) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  const open = list(source.open).map(normalizeRecord).filter((item) => item?.status === "open").slice(-MAX_OPEN);
  const history = list(source.history).map(normalizeRecord).filter((item) => item && item.status !== "open").slice(-MAX_HISTORY);
  const nextDue = open.map((item) => timestamp(item.evaluation_due_at)).filter((value) => value !== null).sort((a, b) => a - b)[0];
  return {
    version: 1,
    open,
    history,
    calibration: calibration(history),
    unscored_outlook_count: Math.max(0, Number(source.unscored_outlook_count || 0)),
    next_evaluation_at: nextDue ? new Date(nextDue).toISOString() : null,
    updated_at: text(source.updated_at, 80) || null,
  };
}

function completedSteps(attention) {
  return list(attention?.evidence?.steps).filter((step) => text(step?.status, 80).toLowerCase() === "completed");
}
function matchingStep(steps, verification) {
  const capability = text(verification?.capability_key, 240);
  if (capability) {
    const match = steps.find((step) => text(step?.capability_key || step?.capability?.key, 240) === capability);
    if (match) return match;
  }
  return steps.find((step) => text(step?.id, 120) === text(verification?.evidence_ref, 120)) || null;
}
function conditionMet(record, observed) {
  const operator = record.verification.operator;
  const target = record.verification.target_value;
  const baseline = record.baseline_value;
  if (operator === "increase") return typeof baseline === "number" && typeof observed === "number" && observed > baseline;
  if (operator === "decrease") return typeof baseline === "number" && typeof observed === "number" && observed < baseline;
  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    if (typeof observed !== "number" || typeof target !== "number") return false;
    if (operator === "gt") return observed > target;
    if (operator === "gte") return observed >= target;
    if (operator === "lt") return observed < target;
    return observed <= target;
  }
  if (operator === "eq") return observed === target;
  if (operator === "neq") return observed !== target;
  return false;
}
function evaluateOpen(record, steps, nowMs, nowIso) {
  const due = timestamp(record.evaluation_due_at);
  const step = matchingStep(steps, record.verification);
  const observed = step ? readPath(step.result, record.verification.path) : null;
  const observedRecord = observed === null ? record : { ...record, last_evaluated_at: nowIso, last_observed_value: observed };
  if (due === null || nowMs < due) return observedRecord;
  if (!step || observed === null) {
    return {
      ...observedRecord,
      status: "resolved",
      resolution: "inconclusive",
      resolved_at: nowIso,
      resolution_evidence_refs: step?.id ? [text(step.id, 120)] : [],
      resolution_reason: step ? "VERIFICATION_PATH_UNAVAILABLE_AT_HORIZON" : "EVIDENCE_UNAVAILABLE_AT_HORIZON",
    };
  }
  const confirmed = conditionMet(record, observed);
  return {
    ...observedRecord,
    status: "resolved",
    resolution: confirmed ? "confirmed" : "contradicted",
    resolved_at: nowIso,
    resolution_evidence_refs: [text(step.id, 120)].filter(Boolean),
    resolution_value: observed,
    resolution_reason: confirmed ? "DETERMINISTIC_VERIFICATION_MATCHED_AT_HORIZON" : "DETERMINISTIC_VERIFICATION_NOT_MET_AT_HORIZON",
  };
}
function materialize(outlook, steps, generatedAt) {
  const source = object(outlook);
  const verification = normalizeOperatorPredictionVerification(source.verification);
  const prediction = text(source.prediction || source.outlook, 700);
  if (!prediction || !verification) return null;
  const step = matchingStep(steps, verification);
  if (!step) return null;
  const allowedRefs = new Set(list(source.evidence_refs || source.basis_refs).map((item) => text(item, 120)).filter(Boolean));
  const stepId = text(step.id, 120);
  if (!allowedRefs.has(verification.evidence_ref) && !allowedRefs.has(stepId)) return null;
  const baseline = readPath(step.result, verification.path);
  if (baseline === null) return null;
  if (["increase", "decrease"].includes(verification.operator) && typeof baseline !== "number") return null;
  const capability = text(step?.capability_key || step?.capability?.key, 240);
  if (!capability) return null;
  verification.capability_key = capability;
  verification.evidence_ref = stepId || verification.evidence_ref;
  const horizon = HORIZON_MS[text(source.horizon, 40)] ? text(source.horizon, 40) : "near_term";
  const createdMs = timestamp(generatedAt) ?? Date.now();
  const subjectKey = `forecast-subject-${fnv1a(`${capability}|${verification.path}`)}`;
  const predictionId = `forecast-${fnv1a(`${capability}|${verification.path}|${verification.operator}|${JSON.stringify(verification.target_value)}|${horizon}`)}`;
  return {
    prediction_id: predictionId,
    subject_key: subjectKey,
    prediction,
    horizon,
    confidence: probability(source.confidence, null),
    evidence_refs: [...allowedRefs].slice(0, 6),
    verification,
    baseline_value: baseline,
    created_at: new Date(createdMs).toISOString(),
    evaluation_due_at: new Date(createdMs + HORIZON_MS[horizon]).toISOString(),
    last_evaluated_at: null,
    last_observed_value: baseline,
    status: "open",
    resolution: null,
    resolved_at: null,
    resolution_evidence_refs: [],
    resolution_value: null,
    resolution_reason: null,
    last_seen_at: new Date(createdMs).toISOString(),
  };
}

export function reconcileOperatorPredictionAccountability({ previousAccountability = null, outlook = [], attention = {}, generatedAt = null } = {}) {
  const previous = normalizeOperatorPredictionAccountability(previousAccountability) || { open: [], history: [] };
  const nowMs = timestamp(generatedAt) ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const steps = completedSteps(attention);
  const openById = new Map();
  let history = [...previous.history];
  for (const record of previous.open) {
    const evaluated = evaluateOpen(record, steps, nowMs, nowIso);
    if (evaluated.status === "open") openById.set(evaluated.prediction_id, evaluated);
    else history.push(evaluated);
  }

  let unscored = 0;
  for (const outlookItem of list(outlook).slice(0, 4)) {
    const candidate = materialize(outlookItem, steps, nowIso);
    if (!candidate) {
      unscored += 1;
      continue;
    }
    if (openById.has(candidate.prediction_id)) {
      const existing = openById.get(candidate.prediction_id);
      openById.set(candidate.prediction_id, { ...existing, last_seen_at: nowIso });
      continue;
    }
    for (const [id, existing] of [...openById.entries()]) {
      if (existing.subject_key !== candidate.subject_key) continue;
      openById.delete(id);
      history.push({
        ...existing,
        status: "superseded",
        resolution: "superseded",
        resolved_at: nowIso,
        resolution_reason: "NEW_FORECAST_REPLACED_OPEN_FORECAST_FOR_SAME_SUBJECT",
      });
    }
    openById.set(candidate.prediction_id, candidate);
  }

  const open = [...openById.values()].sort((a, b) => (timestamp(a.created_at) || 0) - (timestamp(b.created_at) || 0)).slice(-MAX_OPEN);
  history = history.sort((a, b) => (timestamp(a.resolved_at) || 0) - (timestamp(b.resolved_at) || 0)).slice(-MAX_HISTORY);
  return normalizeOperatorPredictionAccountability({ version: 1, open, history, unscored_outlook_count: unscored, updated_at: nowIso });
}

export function operatorPredictionAccountabilitySummary(value) {
  const state = normalizeOperatorPredictionAccountability(value);
  const c = object(state?.calibration);
  const last = [...list(state?.history)].reverse().find((item) => item.resolution && item.resolution !== "superseded");
  return {
    version: 1,
    open_predictions: list(state?.open).length,
    scored_resolved: Number(c.scored_resolved || 0),
    confirmed: Number(c.confirmed || 0),
    contradicted: Number(c.contradicted || 0),
    inconclusive: Number(c.inconclusive || 0),
    superseded: Number(c.superseded || 0),
    observed_success_rate: c.observed_success_rate ?? null,
    mean_confidence: c.mean_confidence ?? null,
    calibration_gap: c.calibration_gap ?? null,
    brier_score: c.brier_score ?? null,
    next_evaluation_at: state?.next_evaluation_at || null,
    unscored_outlook_count: Number(state?.unscored_outlook_count || 0),
    last_resolution: last ? { prediction_id: last.prediction_id, prediction: last.prediction, resolution: last.resolution, resolved_at: last.resolved_at } : null,
  };
}

export const OPERATOR_PREDICTION_VERIFICATION_OPERATORS = Object.freeze(Array.from(OPERATORS));
