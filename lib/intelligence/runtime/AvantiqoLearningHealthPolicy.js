export const AVANTIQO_LEARNING_HEALTH_CONTRACT =
  "AVANTIQO_LEARNING_HEALTH_V1";

const DEFAULT_STALE_HOURS = 6;

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

export function boundedLearningStaleHours(value, fallback = DEFAULT_STALE_HOURS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(168, Math.round(parsed)));
}

export function deriveAvantiqoLearningHealth({
  learningEnabled = false,
  organizationId = "",
  staleHours = DEFAULT_STALE_HOURS,
  now = new Date(),
  activeAgenda = 0,
  dueAgenda = 0,
  errorAgenda = 0,
  activeKnowledge = 0,
  trainingCandidates = 0,
  latestRun = null,
} = {}) {
  const configuredOrganizationId = text(organizationId, 120);
  const normalizedStaleHours = boundedLearningStaleHours(staleHours);
  const normalizedEnabled = typeof learningEnabled === "boolean"
    ? learningEnabled
    : enabled(learningEnabled);

  if (!normalizedEnabled || !configuredOrganizationId) {
    return {
      success: false,
      contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
      status: !normalizedEnabled ? "DISABLED" : "ORGANIZATION_NOT_CONFIGURED",
      operational: false,
      learning_enabled: normalizedEnabled,
      organization_configured: Boolean(configuredOrganizationId),
      stale_after_hours: normalizedStaleHours,
      action_required: !normalizedEnabled
        ? "SET_AVANTIQO_CONTINUOUS_LEARNING_ENABLED"
        : "SET_AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID",
    };
  }

  const latestRunAt = latestRun?.updated_at || latestRun?.created_at || null;
  const latestRunMs = latestRunAt ? Date.parse(latestRunAt) : Number.NaN;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const ageHours = Number.isFinite(latestRunMs) && Number.isFinite(nowMs)
    ? Math.max(0, (nowMs - latestRunMs) / 3_600_000)
    : null;
  const stalled = Number(dueAgenda) > 0 && (
    ageHours === null ||
    ageHours > normalizedStaleHours ||
    Number(errorAgenda) > 0
  );
  const knowledgeEmpty = Number(activeKnowledge) === 0 && Number(trainingCandidates) > 0;

  const status = stalled
    ? "STALLED"
    : knowledgeEmpty
      ? "KNOWLEDGE_BASE_EMPTY"
      : Number(dueAgenda) > 0
        ? "LEARNING_DUE"
        : "HEALTHY";

  return {
    success: !stalled,
    contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
    status,
    operational: !stalled,
    learning_enabled: true,
    organization_configured: true,
    stale_after_hours: normalizedStaleHours,
    agenda: {
      active: Number(activeAgenda) || 0,
      due: Number(dueAgenda) || 0,
      errors: Number(errorAgenda) || 0,
    },
    knowledge: {
      active_reusable: Number(activeKnowledge) || 0,
      training_candidates: Number(trainingCandidates) || 0,
      empty_despite_candidates: knowledgeEmpty,
    },
    latest_run: latestRun
      ? {
          at: latestRunAt,
          age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
          topic: latestRun.subject || null,
          status: latestRun.metadata?.status || null,
          error: latestRun.metadata?.error || null,
        }
      : null,
    action_required: stalled
      ? "RESTORE_CONTINUOUS_LEARNING_PROGRESS"
      : knowledgeEmpty
        ? "ADVANCE_GOVERNED_KNOWLEDGE_PROMOTION"
        : null,
  };
}

export const AvantiqoLearningHealthPolicy = Object.freeze({
  contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
  derive: deriveAvantiqoLearningHealth,
  boundedStaleHours: boundedLearningStaleHours,
});
