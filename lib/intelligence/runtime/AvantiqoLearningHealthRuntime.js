import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_HEALTH_CONTRACT =
  "AVANTIQO_LEARNING_HEALTH_V1";

const MEMORY_TABLE = "intelligence_memories";
const DEFAULT_STALE_HOURS = 6;

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function boundedHours(value, fallback = DEFAULT_STALE_HOURS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(168, Math.round(parsed)));
}

async function countScopeRows({ organizationId, scope, configure = null }) {
  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope);
  if (typeof configure === "function") query = configure(query);
  const result = await query;
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

export async function inspectAvantiqoLearningHealth({ now = new Date() } = {}) {
  const learningEnabled = enabled(process.env.AVANTIQO_CONTINUOUS_LEARNING_ENABLED);
  const organizationId = text(
    process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,
    120,
  );
  const staleHours = boundedHours(process.env.AVANTIQO_CONTINUOUS_LEARNING_STALE_HOURS);

  if (!learningEnabled || !organizationId) {
    return {
      success: false,
      contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
      status: !learningEnabled ? "DISABLED" : "ORGANIZATION_NOT_CONFIGURED",
      operational: false,
      learning_enabled: learningEnabled,
      organization_configured: Boolean(organizationId),
      stale_after_hours: staleHours,
      action_required: !learningEnabled
        ? "SET_AVANTIQO_CONTINUOUS_LEARNING_ENABLED"
        : "SET_AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID",
    };
  }

  const nowIso = now.toISOString();
  const [activeAgenda, dueAgenda, errorAgenda, activeKnowledge, trainingCandidates, latestRun] =
    await Promise.all([
      countScopeRows({
        organizationId,
        scope: "platform_learning_agenda",
        configure: (query) => query.eq("active", true),
      }),
      countScopeRows({
        organizationId,
        scope: "platform_learning_agenda",
        configure: (query) =>
          query.eq("active", true).lte("metadata->>next_research_at", nowIso),
      }),
      countScopeRows({
        organizationId,
        scope: "platform_learning_agenda",
        configure: (query) =>
          query.eq("active", true).eq("metadata->>status", "ERROR"),
      }),
      countScopeRows({
        organizationId,
        scope: "platform_knowledge",
        configure: (query) => query.eq("active", true),
      }),
      countScopeRows({
        organizationId,
        scope: "platform_training_candidates",
        configure: (query) => query.eq("active", true),
      }),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("updated_at,created_at,subject,metadata")
        .eq("organization_id", organizationId)
        .eq("memory_scope", "platform_learning_runs")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (latestRun.error) throw latestRun.error;

  const latestRunAt = latestRun.data?.updated_at || latestRun.data?.created_at || null;
  const latestRunMs = latestRunAt ? Date.parse(latestRunAt) : Number.NaN;
  const ageHours = Number.isFinite(latestRunMs)
    ? Math.max(0, (now.getTime() - latestRunMs) / 3_600_000)
    : null;
  const stalled = dueAgenda > 0 && (ageHours === null || ageHours > staleHours);
  const knowledgeEmpty = activeKnowledge === 0 && trainingCandidates > 0;

  const status = stalled
    ? "STALLED"
    : knowledgeEmpty
      ? "KNOWLEDGE_BASE_EMPTY"
      : dueAgenda > 0
        ? "LEARNING_DUE"
        : "HEALTHY";

  return {
    success: !stalled,
    contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
    status,
    operational: !stalled,
    learning_enabled: true,
    organization_configured: true,
    stale_after_hours: staleHours,
    agenda: {
      active: activeAgenda,
      due: dueAgenda,
      errors: errorAgenda,
    },
    knowledge: {
      active_reusable: activeKnowledge,
      training_candidates: trainingCandidates,
      empty_despite_candidates: knowledgeEmpty,
    },
    latest_run: latestRun.data
      ? {
          at: latestRunAt,
          age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
          topic: latestRun.data.subject || null,
          status: latestRun.data.metadata?.status || null,
          error: latestRun.data.metadata?.error || null,
        }
      : null,
    action_required: stalled
      ? "RESTORE_CONTINUOUS_LEARNING_PROGRESS"
      : knowledgeEmpty
        ? "ADVANCE_GOVERNED_KNOWLEDGE_PROMOTION"
        : null,
  };
}

export const AvantiqoLearningHealthRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
  inspect: inspectAvantiqoLearningHealth,
});
