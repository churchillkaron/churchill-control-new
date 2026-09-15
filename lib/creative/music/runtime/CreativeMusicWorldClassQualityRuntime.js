const CONTRACT = "AVANTIQO_WORLD_CLASS_MUSIC_QUALITY_V1";

const DIMENSIONS = Object.freeze([
  ["brief_fidelity", "Does the result accomplish the exact musical brief?", 0.14],
  ["musicality", "Are melody, harmony, rhythm and form musically convincing?", 0.14],
  ["emotion", "Does the track create the intended emotional response and arc?", 0.12],
  ["originality", "Does it avoid generic, derivative or template-like musical decisions?", 0.10],
  ["arrangement", "Do sections, transitions, dynamics and instrumentation develop professionally?", 0.10],
  ["performance", "Are vocals/instruments expressive, controlled and appropriate to the style?", 0.10],
  ["sound_design", "Are timbre, texture, space and sonic details intentional and premium?", 0.08],
  ["mix_translation", "Does the mix translate with hierarchy, clarity, depth and mono/device resilience?", 0.08],
  ["technical_master", "Are loudness, true peak, codec, clipping, silence and file integrity conformant?", 0.08],
  ["artifact_risk", "Is the result free from audible generation, separation, tuning or edit artifacts?", 0.06],
]);

const LISTENING_ROLES = Object.freeze(["PRODUCER", "MIX_ENGINEER", "MASTERING_ENGINEER", "MUSICIAN", "GENERAL_LISTENER"]);
const TRANSLATION_CONTEXTS = Object.freeze(["STUDIO_MONITORS", "HEADPHONES", "PHONE_SPEAKER", "LAPTOP", "MONO", "STREAMING_CODEC"]);

const HARD_GATES = Object.freeze([
  "SOURCE_RIGHTS_CONFIRMED_WHEN_REQUIRED",
  "ORIGINAL_SOURCE_PRESERVED",
  "NO_CLIPPING_OR_CORRUPT_DELIVERY",
  "MASTER_REPORT_PASS",
  "INDEPENDENT_LISTENING_REVIEW_PRESENT",
  "INTENDED_VS_RENDERED_COMPARISON_PRESENT",
  "MULTI_ROLE_LISTENING_PANEL_PRESENT",
  "TRANSLATION_MATRIX_PRESENT",
  "SOURCE_FIT_PREFLIGHT_PASS",
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalizedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

export function buildMusicIntendedVsRenderedReview({ plan = {}, evidence = {} } = {}) {
  const intended = {
    objective: text(plan.objective),
    capabilities: list(plan.selected_capabilities).map((item) => text(item.id)).filter(Boolean),
    workers: list(plan.workers).map((item) => text(item.id)).filter(Boolean),
    phases: list(plan.phases).map((item) => text(item.phase)).filter(Boolean),
  };
  const rendered = object(evidence.rendered);
  const scores = object(evidence.scores);
  const notes = object(evidence.notes);
  const dimensions = DIMENSIONS.map(([id, question, weight]) => ({
    id, question, weight,
    score: normalizedScore(scores[id]),
    notes: text(notes[id]) || null,
  }));
  const complete = dimensions.every((item) => item.score !== null);
  const weightedScore = complete
    ? dimensions.reduce((sum, item) => sum + item.score * item.weight, 0)
    : null;
  return {
    contract: CONTRACT,
    review_type: "INTENDED_VS_RENDERED",
    intended,
    rendered,
    dimensions,
    complete,
    weighted_score: weightedScore === null ? null : Number(weightedScore.toFixed(2)),
    independent_reviewer_required: true,
    reviewer_must_be_separate_from_generator: true,
  };
}

export function buildMusicQualityTribunal({ plan = {}, review = {}, evidence = {} } = {}) {
  const masterReport = object(evidence.master_report);
  const reviewerRoles = new Set(list(evidence.listening_reviewer_roles).map((value) => text(value).toUpperCase()).filter(Boolean));
  const translationContexts = new Set(list(evidence.translation_contexts).map((value) => text(value).toUpperCase()).filter(Boolean));
  const requiredReviewerRoles = LISTENING_ROLES.filter((role) => role !== "GENERAL_LISTENER");
  const requiredTranslationContexts = TRANSLATION_CONTEXTS.filter((context) => context !== "STUDIO_MONITORS");
  const hardGateState = {
    SOURCE_RIGHTS_CONFIRMED_WHEN_REQUIRED: evidence.source_rights_required !== true || evidence.source_rights_confirmed === true,
    ORIGINAL_SOURCE_PRESERVED: evidence.source_present !== true || evidence.original_source_preserved === true,
    NO_CLIPPING_OR_CORRUPT_DELIVERY: evidence.clipping_detected !== true && evidence.delivery_corrupt !== true,
    MASTER_REPORT_PASS: masterReport.passed === true,
    INDEPENDENT_LISTENING_REVIEW_PRESENT: review.complete === true,
    INTENDED_VS_RENDERED_COMPARISON_PRESENT: text(review.review_type) === "INTENDED_VS_RENDERED",
    MULTI_ROLE_LISTENING_PANEL_PRESENT: requiredReviewerRoles.every((role) => reviewerRoles.has(role)),
    TRANSLATION_MATRIX_PRESENT: requiredTranslationContexts.every((context) => translationContexts.has(context)),
    SOURCE_FIT_PREFLIGHT_PASS: evidence.source_fit_preflight_passed === true,
  };
  const failedHardGates = HARD_GATES.filter((gate) => hardGateState[gate] !== true);
  const score = normalizedScore(review.weighted_score);
  const pass = failedHardGates.length === 0 && score !== null && score >= 90;
  return {
    contract: CONTRACT,
    tribunal_type: "MUSIC_WORLD_CLASS_RELEASE_TRIBUNAL",
    plan_contract: text(plan.contract) || null,
    hard_gates: hardGateState,
    failed_hard_gates: failedHardGates,
    weighted_score: score,
    threshold: 90,
    verdict: pass ? "PASS" : "REPAIR",
    release_ready: pass,
    repair_required: !pass,
    publication_authorized: false,
  };
}

export const CreativeMusicWorldClassQualityRuntime = Object.freeze({
  contract: CONTRACT,
  dimensions: DIMENSIONS,
  hardGates: HARD_GATES,
  listeningRoles: LISTENING_ROLES,
  translationContexts: TRANSLATION_CONTEXTS,
  intendedVsRendered: buildMusicIntendedVsRenderedReview,
  tribunal: buildMusicQualityTribunal,
});
