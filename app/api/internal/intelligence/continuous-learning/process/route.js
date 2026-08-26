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
import {
  reconcileAvantiqoKnowledgeDependencyCurriculum,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeDependencyCurriculumRuntime";
import {
  reconcileAvantiqoLearningMasteryFrontier,
} from "@/lib/intelligence/runtime/AvantiqoLearningMasteryFrontierRuntime";
import {
  reconcileAvantiqoLearningTransfer,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferRuntime";
import {
  reconcileAvantiqoLearningTransferValidation,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferValidationRuntime";
import {
  reconcileAvantiqoNegativeTransferEvidenceClock,
} from "@/lib/intelligence/runtime/AvantiqoNegativeTransferEvidenceClockRuntime";
import {
  reconcileAvantiqoLearningTransferRevisions,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferRevisionRuntime";
import {
  reconcileAvantiqoActiveExperimentSelection,
} from "@/lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime";

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
    // 2. Classify learned external knowledge as fresh, aging, due or expired.
    // 3. Discover product/evidence coverage gaps after lifecycle cleanup.
    // 4. Evaluate whether prior research is productive and adapt priority/cadence.
    // 5. Apply only anti-overfit eligible observational knowledge-utility feedback.
    // 6. Bridge staged public-evidence candidates into adversarial mechanism review.
    // 7. Escalate weak/unsolved topics into mechanism and experiment discovery tracks.
    // 8. Reconcile governed syntheses into hypotheses and experiment proposals.
    // 9. Reconcile mature experimental candidates against the Evidence Graph.
    // 10. Evaluate non-influencing provisional shadow observations.
    // 11. Create counterfactual benchmark plans and final release review candidates.
    // 12. Revalidate explicitly released knowledge; cron cannot release or restore it.
    // 13. Propagate quarantine only through explicitly verified hard dependencies.
    // 14. Reconcile evidence-backed mastery and a bounded learning frontier.
    // 15. Generate bounded cross-domain transfer-discovery work.
    // 16. Reconcile governed transfer experiment results and negative-transfer memory.
    // 17. Reconcile replicated contradiction attribution into single-component revision requests.
    // 18. Select unresolved experiments by conservative information gain per cost.
    //     Exact experiment versions require >=2 independent, method-diverse estimates.
    //     Lowest information-gain, highest-cost and highest-risk estimates are used.
    //     Selection is short-lived review evidence only, never execution authorization.
    // 19. Spend the existing bounded public-evidence research budget on the resulting agenda.
    // Stages 1-18 never authorize spend/provider execution, execute experiments,
    // submit RunPod jobs, mutate model weights, release knowledge, or fabricate results.
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
    const knowledgeDependencyCurriculum =
      await reconcileAvantiqoKnowledgeDependencyCurriculum();
    const learningMasteryFrontier =
      await reconcileAvantiqoLearningMasteryFrontier();
    const learningTransfer = await reconcileAvantiqoLearningTransfer();
    const learningTransferValidation =
      await reconcileAvantiqoLearningTransferValidation();
    const negativeTransferEvidenceClock =
      await reconcileAvantiqoNegativeTransferEvidenceClock();
    const learningTransferRevision =
      await reconcileAvantiqoLearningTransferRevisions();
    const activeExperimentSelection =
      await reconcileAvantiqoActiveExperimentSelection();
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
        knowledge_dependency_curriculum: knowledgeDependencyCurriculum,
        learning_mastery_frontier: learningMasteryFrontier,
        learning_transfer: learningTransfer,
        learning_transfer_validation: learningTransferValidation,
        negative_transfer_evidence_clock: negativeTransferEvidenceClock,
        learning_transfer_revision: learningTransferRevision,
        active_experiment_selection: activeExperimentSelection,
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
