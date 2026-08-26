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
  reconcileAvantiqoExperimentOutcomeAssessorCalibration,
} from "@/lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime";
import {
  reconcileAvantiqoExperimentEstimatorCalibration,
} from "@/lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime";
import {
  reconcileAvantiqoActiveExperimentSelection,
} from "@/lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime";
import {
  reconcileAvantiqoEstimatorCalibratedSelectionGuard,
} from "@/lib/intelligence/runtime/AvantiqoEstimatorCalibratedSelectionGuardRuntime";
import {
  reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard,
} from "@/lib/intelligence/runtime/AvantiqoAssessorCalibratedEstimatorSelectionGuardRuntime";
import {
  reconcileAvantiqoExperimentExecutionRequests,
} from "@/lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 1, 3));

    // Closed-loop learning order. All trust/calibration stages are provider-free and
    // can only remove qualification or create evidence/holds; none can authorize execution.
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
    const releasedKnowledgeLifecycle = await reconcileAvantiqoReleasedKnowledgeLifecycle();
    const knowledgeDependencyCurriculum =
      await reconcileAvantiqoKnowledgeDependencyCurriculum();
    const learningMasteryFrontier = await reconcileAvantiqoLearningMasteryFrontier();
    const learningTransfer = await reconcileAvantiqoLearningTransfer();
    const learningTransferValidation = await reconcileAvantiqoLearningTransferValidation();
    const negativeTransferEvidenceClock =
      await reconcileAvantiqoNegativeTransferEvidenceClock();
    const learningTransferRevision = await reconcileAvantiqoLearningTransferRevisions();

    // Calibrate post-result assessors first, then estimator calibration can be
    // independently guarded against assessor-backed false negatives.
    const experimentOutcomeAssessorCalibration =
      await reconcileAvantiqoExperimentOutcomeAssessorCalibration();
    const experimentEstimatorCalibration =
      await reconcileAvantiqoExperimentEstimatorCalibration();

    const activeExperimentSelection = await reconcileAvantiqoActiveExperimentSelection();
    const estimatorCalibratedSelectionGuard =
      await reconcileAvantiqoEstimatorCalibratedSelectionGuard();
    const assessorCalibratedEstimatorSelectionGuard =
      await reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard();

    // Execution requests are generated only after both calibration guards have
    // had the opportunity to retire unsafe selections fail-closed.
    const experimentExecutionRequests = await reconcileAvantiqoExperimentExecutionRequests();
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
        experiment_outcome_assessor_calibration: experimentOutcomeAssessorCalibration,
        experiment_estimator_calibration: experimentEstimatorCalibration,
        active_experiment_selection: activeExperimentSelection,
        estimator_calibrated_selection_guard: estimatorCalibratedSelectionGuard,
        assessor_calibrated_estimator_selection_guard:
          assessorCalibratedEstimatorSelectionGuard,
        experiment_execution_requests: experimentExecutionRequests,
      },
      { status: result.success === false ? 207 : 200 },
    );
  } catch (error) {
    console.error("AVANTIQO_CONTINUOUS_LEARNING_CRON_FAILED", error);
    return Response.json(
      { success: false, error: error?.message || "Continuous learning failed" },
      { status: 500 },
    );
  }
}
