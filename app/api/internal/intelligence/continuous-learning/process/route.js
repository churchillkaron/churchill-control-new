export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  runAvantiqoContinuousLearningBatch,
} from "@/lib/intelligence/runtime/AvantiqoContinuousLearningRuntime";
import {
  reconcileAvantiqoLearningEvidenceCandidates,
} from "@/lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime";
import {
  syncAvantiqoInternalProductKnowledge,
} from "@/lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime";
import {
  reconcileAvantiqoKnowledgeLifecycle,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeLifecycleRuntime";
import {
  reconcileAvantiqoLearningCoverage,
} from "@/lib/intelligence/runtime/AvantiqoLearningCoverageRuntime";
import {
  evaluateAvantiqoLearningEffectiveness,
} from "@/lib/intelligence/runtime/AvantiqoLearningEffectivenessRuntime";
import {
  applyAvantiqoKnowledgeUtilityFeedback,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeUtilityFeedbackRuntime";
import {
  reconcileAvantiqoMechanismFirstLearning,
} from "@/lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime";
import {
  reconcileAvantiqoScientificLearningExperiments,
} from "@/lib/intelligence/runtime/AvantiqoScientificLearningExperimentRuntime";
import {
  reconcileAvantiqoEpistemicPromotion,
} from "@/lib/intelligence/runtime/AvantiqoEpistemicPromotionRuntime";
import {
  reconcileAvantiqoProvisionalKnowledgeShadow,
} from "@/lib/intelligence/runtime/AvantiqoProvisionalKnowledgeShadowRuntime";
import {
  reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans,
  reconcileAvantiqoKnowledgeFinalPromotionCandidates,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime";
import {
  reconcileAvantiqoReleasedKnowledgeLifecycle,
} from "@/lib/intelligence/runtime/AvantiqoReleasedKnowledgeLifecycleRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit")) || 1, 3),
    );

    // Closed-loop Learning order:
    // 1. Synchronize Avantiqo's canonical product truth.
    // 2. Classify learned external knowledge as fresh, aging, due or expired;
    //    retire expired/exact-duplicate rows and regenerate relearning curriculum.
    // 3. Discover product/evidence coverage gaps after lifecycle cleanup.
    // 4. Evaluate whether prior research is productive and adapt priority/cadence.
    // 5. Apply only anti-overfit eligible observational knowledge-utility feedback.
    // 6. Bridge previously staged public-evidence candidates into adversarial
    //    mechanism review. Evidence candidates never become facts here.
    // 7. Escalate weak/unsolved topics into provider-free mechanism, constraint,
    //    adjacent-domain and experiment-evidence discovery tracks.
    // 8. Reconcile governed syntheses into hypotheses, experiment proposals,
    //    replication status and experimental knowledge candidates.
    // 9. Adversarially reconcile mature experimental candidates against the
    //    durable Evidence Graph and create shadow-only provisional knowledge.
    // 10. Evaluate non-influencing provisional shadow observations. Context
    //     success is not treated as incremental utility.
    // 11. Create immutable counterfactual A/B benchmark plans for mature shadow
    //     candidates and reconcile only separately-recorded passing evaluations
    //     into final knowledge release review candidates. This stage performs no
    //     benchmark execution and never writes platform_knowledge.
    // 12. Revalidate only knowledge previously released through the explicit
    //     final-release runtime. Conflict, stale evidence or missing provenance
    //     quarantines it immediately. Successful same-cycle revalidation renews
    //     its bounded validity window; this cron cannot release or restore it.
    // 13. Spend the existing bounded public-evidence research budget on the
    //     resulting agenda, including adversarial reconciliation work. Newly
    //     supported claims are staged as evidence candidates for the next cycle.
    // Any hypothesis/invention synthesis or counterfactual benchmark execution
    // that could wake owned RunPod Intelligence is deliberately outside this
    // cron and must execute through AVANTIQO_RUNPOD_SAFE_LEASE_V2.
    // Stages 1-12 never mutate model weights, authorize product actions, execute
    // experiments, submit RunPod jobs, automatically release knowledge, or
    // automatically restore quarantined/retired knowledge.
    const internalProductKnowledge = await syncAvantiqoInternalProductKnowledge();
    const knowledgeLifecycle = await reconcileAvantiqoKnowledgeLifecycle();
    const learningCoverage = await reconcileAvantiqoLearningCoverage();
    const learningEffectiveness = await evaluateAvantiqoLearningEffectiveness();
    const knowledgeUtilityFeedback = await applyAvantiqoKnowledgeUtilityFeedback();
    const learningEvidenceCandidateBridge =
      await reconcileAvantiqoLearningEvidenceCandidates();
    const mechanismFirstLearning = await reconcileAvantiqoMechanismFirstLearning();
    const scientificLearning = await reconcileAvantiqoScientificLearningExperiments();
    const epistemicPromotion = await reconcileAvantiqoEpistemicPromotion();
    const provisionalKnowledgeShadow = await reconcileAvantiqoProvisionalKnowledgeShadow();
    const knowledgeCounterfactualBenchmarkPlans =
      await reconcileAvantiqoKnowledgeCounterfactualBenchmarkPlans();
    const knowledgeFinalPromotionCandidates =
      await reconcileAvantiqoKnowledgeFinalPromotionCandidates();
    const releasedKnowledgeLifecycle =
      await reconcileAvantiqoReleasedKnowledgeLifecycle();
    const result = await runAvantiqoContinuousLearningBatch({ limit });

    return Response.json(
      {
        ...result,
        internal_product_knowledge: internalProductKnowledge,
        knowledge_lifecycle: knowledgeLifecycle,
        learning_coverage: learningCoverage,
        learning_effectiveness: learningEffectiveness,
        knowledge_utility_feedback: knowledgeUtilityFeedback,
        learning_evidence_candidate_bridge: learningEvidenceCandidateBridge,
        mechanism_first_learning: mechanismFirstLearning,
        scientific_learning: scientificLearning,
        epistemic_promotion: epistemicPromotion,
        provisional_knowledge_shadow: provisionalKnowledgeShadow,
        knowledge_counterfactual_benchmark_plans: knowledgeCounterfactualBenchmarkPlans,
        knowledge_final_promotion_candidates: knowledgeFinalPromotionCandidates,
        released_knowledge_revalidation: releasedKnowledgeLifecycle,
        released_knowledge_lifecycle: releasedKnowledgeLifecycle,
      },
      {
        status: result.success === false ? 207 : 200,
      },
    );
  } catch (error) {
    console.error("AVANTIQO_CONTINUOUS_LEARNING_CRON_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Continuous learning failed",
      },
      { status: 500 },
    );
  }
}
