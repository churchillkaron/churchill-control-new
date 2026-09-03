import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_LEARNING_HEALTH_CONTRACT,
  boundedLearningStaleHours,
  deriveAvantiqoLearningHealth,
} from "./AvantiqoLearningHealthPolicy";

const MEMORY_TABLE = "intelligence_memories";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
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
  const staleHours = boundedLearningStaleHours(
    process.env.AVANTIQO_CONTINUOUS_LEARNING_STALE_HOURS,
  );

  if (!learningEnabled || !organizationId) {
    return deriveAvantiqoLearningHealth({
      learningEnabled,
      organizationId,
      staleHours,
      now,
    });
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

  return deriveAvantiqoLearningHealth({
    learningEnabled,
    organizationId,
    staleHours,
    now,
    activeAgenda,
    dueAgenda,
    errorAgenda,
    activeKnowledge,
    trainingCandidates,
    latestRun: latestRun.data || null,
  });
}

export { AVANTIQO_LEARNING_HEALTH_CONTRACT };

export const AvantiqoLearningHealthRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_HEALTH_CONTRACT,
  inspect: inspectAvantiqoLearningHealth,
});
