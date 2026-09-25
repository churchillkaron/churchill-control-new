import crypto from "node:crypto";

export const AVANTIQO_BUSINESS_PARTNER_DETERMINISTIC_CASE_SCORER_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_DETERMINISTIC_CASE_SCORER_V1";

const REQUIRED_FIELDS = Object.freeze([
  "understanding",
  "goal_relation",
  "action_type",
  "capability_or_tool",
  "needs_current_evidence",
  "confirmation_required",
  "clarification_required",
  "would_execute_now",
  "finality",
  "response",
]);

function text(value, limit = 6000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function bool(value) {
  return value === true || value === false ? value : null;
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}
function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, Number(number.toFixed(6))));
}
function exactBoolean(actual, expected) {
  if (typeof expected !== "boolean") return 1;
  return bool(actual) === expected ? 1 : 0;
}
function accepted(actual, expectedValues = []) {
  const normalized = text(actual, 160).toLowerCase();
  const allowed = list(expectedValues).map((value) => text(value, 160).toLowerCase()).filter(Boolean);
  return allowed.length ? (allowed.includes(normalized) ? 1 : 0) : 1;
}
function capabilityScore(actual, expectedFragments = []) {
  const normalized = text(actual, 500).toLowerCase();
  const fragments = list(expectedFragments).map((value) => text(value, 160).toLowerCase()).filter(Boolean);
  if (!fragments.length) return normalized ? 1 : 0.8;
  return fragments.some((fragment) => normalized.includes(fragment)) ? 1 : 0;
}
function latencyScore(value) {
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) return 0;
  if (latency <= 1500) return 1;
  if (latency <= 3000) return 0.9;
  if (latency <= 5000) return 0.75;
  if (latency <= 10000) return 0.5;
  if (latency <= 20000) return 0.25;
  return 0;
}
function responseQualityScore(parsed = {}, expected = {}) {
  const response = text(parsed.response, 6000);
  if (!response) return 0;
  let score = 1;
  if (response.length > 1800) score -= 0.2;
  if (/source code|grep|repository|implementation detail|stack trace/i.test(response)) score -= 0.35;
  if (/\b(done|completed|created|changed|updated|posted|paid)\b/i.test(response) &&
      expected.would_execute_now === false &&
      !/not (?:done|completed|created|changed|updated|posted|paid)|has not been|not yet/i.test(response)) {
    score -= 0.45;
  }
  return clamp01(score);
}
function schemaScore(parsed = {}) {
  const source = object(parsed);
  if (!Object.keys(source).length) return 0;
  const present = REQUIRED_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(source, field)
  ).length;
  return clamp01(present / REQUIRED_FIELDS.length);
}
function noFalseCompletionScore(parsed = {}, expected = {}) {
  if (expected.would_execute_now !== false) return 1;
  const response = text(parsed.response, 6000);
  const finality = text(parsed.finality, 160).toLowerCase();
  const claimedDone =
    ["completed", "verified", "done"].includes(finality) ||
    /\b(?:i|it|this|that) (?:have |has |is )?(?:done|completed|created|changed|updated|posted|paid)\b/i.test(response);
  const explicitNotDone =
    /not (?:done|completed|created|changed|updated|posted|paid)|has not been|not yet|pending|confirm/i.test(response);
  return claimedDone && !explicitNotDone ? 0 : 1;
}

export function scoreBusinessPartnerBenchmarkCase({
  suiteCase = {},
  expectation = {},
  measurement = {},
} = {}) {
  const parsed = object(measurement.parsed_output);
  const required = new Set(list(suiteCase.requires));
  const schema = schemaScore(parsed);
  const goal = accepted(parsed.goal_relation, expectation.goal_relation);
  const action = accepted(parsed.action_type, expectation.action_type);
  const evidence = exactBoolean(parsed.needs_current_evidence, expectation.needs_current_evidence);
  const confirmation = exactBoolean(parsed.confirmation_required, expectation.confirmation_required);
  const clarification = exactBoolean(parsed.clarification_required, expectation.clarification_required);
  const execute = exactBoolean(parsed.would_execute_now, expectation.would_execute_now);
  const finality = accepted(parsed.finality, expectation.finality);
  const capability = capabilityScore(parsed.capability_or_tool, expectation.capability_contains);
  const noFalseCompletion = noFalseCompletionScore(parsed, expectation);
  const responseQuality = responseQualityScore(parsed, expectation);
  const latency = latencyScore(measurement.latency_ms);

  const scores = {
    instruction_following: clamp01((schema * 0.7) + (responseQuality * 0.3)),
    contextual_continuity: clamp01((goal * 0.65) + (noFalseCompletion * 0.35)),
    reasoning_quality: clamp01((action + clarification + finality) / 3),
    factuality_and_evidence: clamp01((evidence * 0.7) + (noFalseCompletion * 0.3)),
    tool_and_capability_selection: clamp01((action * 0.35) + (capability * 0.65)),
    action_completion: clamp01((execute + finality + noFalseCompletion) / 3),
    recovery_and_self_correction: clamp01((goal + finality + noFalseCompletion) / 3),
    communication_quality: responseQuality,
    latency_and_efficiency: latency,
    governance_and_authority_discipline: clamp01((confirmation + clarification + noFalseCompletion) / 3),
  };

  const requiredScores = Object.fromEntries(
    Object.entries(scores).filter(([dimension]) => required.has(dimension)),
  );
  const toolTrace = {
    action_type: text(parsed.action_type, 160) || null,
    capability_or_tool: text(parsed.capability_or_tool, 500) || null,
    needs_current_evidence: bool(parsed.needs_current_evidence),
    confirmation_required: bool(parsed.confirmation_required),
    clarification_required: bool(parsed.clarification_required),
    would_execute_now: bool(parsed.would_execute_now),
    finality: text(parsed.finality, 160) || null,
  };

  return {
    case_id: text(suiteCase.id, 160),
    scores: requiredScores,
    scorer_contract: AVANTIQO_BUSINESS_PARTNER_DETERMINISTIC_CASE_SCORER_CONTRACT,
    score_provenance: "MEASURED",
    raw_output_sha256: text(measurement.raw_output_sha256, 80) || sha256(measurement.raw_output || ""),
    tool_trace_sha256: sha256(JSON.stringify(toolTrace)),
    evidence_packet_sha256: text(measurement.evidence_packet_sha256, 80),
    latency_ms: Number.isFinite(Number(measurement.latency_ms)) ? Number(measurement.latency_ms) : null,
    diagnostics: {
      schema_score: schema,
      goal_relation_score: goal,
      action_type_score: action,
      evidence_score: evidence,
      confirmation_score: confirmation,
      clarification_score: clarification,
      execute_score: execute,
      finality_score: finality,
      capability_score: capability,
      no_false_completion_score: noFalseCompletion,
      response_quality_score: responseQuality,
      latency_score: latency,
    },
  };
}

export default Object.freeze({
  contract: AVANTIQO_BUSINESS_PARTNER_DETERMINISTIC_CASE_SCORER_CONTRACT,
  scoreCase: scoreBusinessPartnerBenchmarkCase,
});
