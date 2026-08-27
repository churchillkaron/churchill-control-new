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
  reconcileAvantiqoExperimentPortfolioPerformance,
} from "@/lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime";
import {
  reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio,
} from "@/lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime";
import {
  reconcileAvantiqoSelectionPolicyShadowChallenger,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime";
import {
  reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime";
import {
  reconcileAvantiqoSelectionPolicyPromotionRequests,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime";
import {
  reconcileAvantiqoSelectionPolicyCanary,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime";
import {
  reconcileAvantiqoSelectionPolicyCanaryOutcomeCertification,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime";
import {
  reconcileAvantiqoPersistentOrderingPolicyPromotionRequests,
} from "@/lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime";
import {
  reconcileAvantiqoPersistentOrderingPolicyApplication,
} from "@/lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime";
import {
  reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor,
} from "@/lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime";
import {
  verifyAvantiqoPersistentPolicyGenerationIntegrity,
} from "@/lib/intelligence/runtime/AvantiqoPersistentPolicyGenerationIntegrityRuntime";
import {
  verifyAvantiqoPersistentPolicyActivationGenerationIntegrity,
} from "@/lib/intelligence/runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime";
import {
  reconcileAvantiqoSelectionPolicyResearchEpoch,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime";
import {
  reconcileAvantiqoRebasedSelectionPolicyChallenger,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime";
import {
  reconcileAvantiqoRebasedSelectionPolicyPromotionRequests,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime";
import {
  reconcileAvantiqoRebasedSelectionPolicyCanary,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyCanaryRuntime";
import {
  reconcileAvantiqoPersistentPolicySuccessionRequests,
} from "@/lib/intelligence/runtime/AvantiqoPersistentPolicySuccessionRuntime";
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

    const experimentOutcomeAssessorCalibration =
      await reconcileAvantiqoExperimentOutcomeAssessorCalibration();
    const experimentEstimatorCalibration =
      await reconcileAvantiqoExperimentEstimatorCalibration();
    const experimentPortfolioPerformance =
      await reconcileAvantiqoExperimentPortfolioPerformance();

    const longHorizonPolicyAdaptedExperimentPortfolio =
      await reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio();
    const calibrationBackfilledExperimentPortfolio =
      longHorizonPolicyAdaptedExperimentPortfolio
        .final_calibration_backfilled_experiment_portfolio || null;
    const activeExperimentSelection =
      calibrationBackfilledExperimentPortfolio
        ?.final_active_experiment_selection || null;
    const estimatorCalibratedSelectionGuard =
      calibrationBackfilledExperimentPortfolio
        ?.final_estimator_calibrated_selection_guard || null;
    const assessorCalibratedEstimatorSelectionGuard =
      calibrationBackfilledExperimentPortfolio
        ?.final_assessor_calibrated_estimator_selection_guard || null;

    const persistentPolicyActivationGenerationResearchIntegrity =
      await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity();
    const selectionPolicyResearchEpoch =
      persistentPolicyActivationGenerationResearchIntegrity.success !== false &&
      persistentPolicyActivationGenerationResearchIntegrity.research_generation_allowed !== false
        ? await reconcileAvantiqoSelectionPolicyResearchEpoch()
        : {
            success: false,
            status: "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED",
            persistent_policy_active:
              persistentPolicyActivationGenerationResearchIntegrity.persistent_policy_active,
            legacy_challenger_promotion_allowed: false,
            execution_authorized: false,
          };
    const legacyChallengerPromotionAllowed =
      selectionPolicyResearchEpoch.legacy_challenger_promotion_allowed !== false;

    const selectionPolicyShadowChallenger =
      await reconcileAvantiqoSelectionPolicyShadowChallenger({
        portfolio: longHorizonPolicyAdaptedExperimentPortfolio,
      });
    const selectionPolicyShadowEvaluationIntegrity =
      await reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity();
    const selectionPolicyPromotionRequests =
      selectionPolicyResearchEpoch.success === false
        ? {
            success: false,
            status: "BLOCKED_BY_SELECTION_POLICY_RESEARCH_EPOCH_FAIL_CLOSED",
            request_count: 0,
          }
        : legacyChallengerPromotionAllowed === false
          ? {
              success: true,
              status: "BLOCKED_BY_ACTIVE_PERSISTENT_POLICY_RESEARCH_EPOCH",
              request_count: 0,
              automatic_policy_promotion: false,
            }
          : selectionPolicyShadowEvaluationIntegrity.success !== false
            ? await reconcileAvantiqoSelectionPolicyPromotionRequests()
            : {
                success: false,
                status: "BLOCKED_BY_SHADOW_EVALUATION_INTEGRITY_FAIL_CLOSED",
                request_count: 0,
              };

    const selectionPolicyCanary = await reconcileAvantiqoSelectionPolicyCanary();
    const selectionPolicyCanaryOutcomeCertification =
      await reconcileAvantiqoSelectionPolicyCanaryOutcomeCertification();
    const persistentOrderingPolicyPromotionRequests =
      selectionPolicyResearchEpoch.success === false
        ? {
            success: false,
            status: "BLOCKED_BY_SELECTION_POLICY_RESEARCH_EPOCH_FAIL_CLOSED",
            request_count: 0,
          }
        : legacyChallengerPromotionAllowed === false
          ? {
              success: true,
              status: "BLOCKED_BY_ACTIVE_PERSISTENT_POLICY_RESEARCH_EPOCH",
              request_count: 0,
              automatic_policy_promotion: false,
            }
          : selectionPolicyShadowEvaluationIntegrity.success !== false
            ? await reconcileAvantiqoPersistentOrderingPolicyPromotionRequests()
            : {
                success: false,
                status: "BLOCKED_BY_SHADOW_EVALUATION_INTEGRITY_FAIL_CLOSED",
                request_count: 0,
              };

    const persistentOrderingPolicyApplication =
      selectionPolicyResearchEpoch.success !== false &&
      selectionPolicyShadowChallenger.success !== false &&
      selectionPolicyShadowEvaluationIntegrity.success !== false &&
      selectionPolicyCanary.success !== false
        ? await reconcileAvantiqoPersistentOrderingPolicyApplication()
        : {
            success: false,
            status: "BLOCKED_BY_POLICY_ORDERING_PRECONDITION_FAIL_CLOSED",
            application_performed: false,
            live_policy_active: false,
            execution_authorized: false,
          };

    const persistentOrderingPolicyRegressionMonitor =
      persistentOrderingPolicyApplication.success !== false
        ? await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()
        : {
            success: false,
            status: "BLOCKED_BY_PERSISTENT_ORDERING_POLICY_APPLICATION_FAIL_CLOSED",
            automatic_rollback_performed: false,
            execution_request_generation_allowed: false,
          };

    const persistentPolicyGenerationIntegrity =
      persistentOrderingPolicyApplication.success !== false &&
      persistentOrderingPolicyRegressionMonitor.success !== false &&
      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed !== false
        ? await verifyAvantiqoPersistentPolicyGenerationIntegrity()
        : {
            success: false,
            status: "BLOCKED_BY_PERSISTENT_POLICY_REGRESSION_PRECONDITION_FAIL_CLOSED",
            execution_request_generation_allowed: false,
            read_only_integrity_verification: true,
          };

    const persistentPolicyActivationGenerationIntegrity =
      persistentOrderingPolicyApplication.success !== false &&
      persistentOrderingPolicyRegressionMonitor.success !== false &&
      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed !== false &&
      persistentPolicyGenerationIntegrity.success !== false &&
      persistentPolicyGenerationIntegrity.execution_request_generation_allowed !== false
        ? await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()
        : {
            success: false,
            status: "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_PRECONDITION_FAIL_CLOSED",
            research_generation_allowed: false,
            execution_request_generation_allowed: false,
            read_only_integrity_verification: true,
          };

    const rebasedSelectionPolicyChallenger =
      selectionPolicyResearchEpoch.success !== false &&
      persistentOrderingPolicyApplication.success !== false &&
      persistentOrderingPolicyRegressionMonitor.success !== false &&
      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed !== false &&
      persistentPolicyGenerationIntegrity.success !== false &&
      persistentPolicyGenerationIntegrity.execution_request_generation_allowed !== false &&
      persistentPolicyActivationGenerationIntegrity.success !== false &&
      persistentPolicyActivationGenerationIntegrity.research_generation_allowed !== false &&
      persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed !== false
        ? await reconcileAvantiqoRebasedSelectionPolicyChallenger()
        : {
            success: false,
            status:
              persistentPolicyActivationGenerationIntegrity.success === false ||
              persistentPolicyActivationGenerationIntegrity.research_generation_allowed === false ||
              persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed === false
                ? "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"
                : persistentPolicyGenerationIntegrity.success === false ||
                    persistentPolicyGenerationIntegrity.execution_request_generation_allowed === false
                  ? "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_INTEGRITY_FAIL_CLOSED"
                  : "BLOCKED_BY_PERSISTENT_POLICY_RESEARCH_PRECONDITION_FAIL_CLOSED",
            proposal_ready: false,
            promotion_authorized: false,
            live_ordering_mutated: false,
            execution_authorized: false,
          };

    const rebasedSelectionPolicyPromotionRequests =
      rebasedSelectionPolicyChallenger.success !== false
        ? await reconcileAvantiqoRebasedSelectionPolicyPromotionRequests()
        : {
            success: false,
            status: "BLOCKED_BY_REBASED_SELECTION_POLICY_CHALLENGER_FAIL_CLOSED",
            request_count: 0,
            automatic_policy_promotion: false,
            automatic_policy_activation: false,
          };

    const rebasedSelectionPolicyCanary =
      persistentOrderingPolicyApplication.success !== false &&
      persistentOrderingPolicyRegressionMonitor.success !== false &&
      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed !== false &&
      persistentPolicyGenerationIntegrity.success !== false &&
      persistentPolicyGenerationIntegrity.execution_request_generation_allowed !== false &&
      persistentPolicyActivationGenerationIntegrity.success !== false &&
      persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed !== false &&
      rebasedSelectionPolicyChallenger.success !== false &&
      rebasedSelectionPolicyPromotionRequests.success !== false
        ? await reconcileAvantiqoRebasedSelectionPolicyCanary()
        : {
            success: false,
            status:
              persistentPolicyActivationGenerationIntegrity.success === false ||
              persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed === false
                ? "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"
                : persistentPolicyGenerationIntegrity.success === false ||
                    persistentPolicyGenerationIntegrity.execution_request_generation_allowed === false
                  ? "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_INTEGRITY_FAIL_CLOSED"
                  : "BLOCKED_BY_REBASED_CANARY_PRECONDITION_FAIL_CLOSED",
            canary_active: false,
            execution_request_generation_allowed: false,
            automatic_activation: false,
          };

    const persistentPolicySuccessionRequests =
      rebasedSelectionPolicyCanary.success !== false
        ? await reconcileAvantiqoPersistentPolicySuccessionRequests()
        : {
            success: false,
            status: "BLOCKED_BY_REBASED_SELECTION_POLICY_CANARY_FAIL_CLOSED",
            request_count: 0,
            automatic_policy_succession: false,
            automatic_policy_activation: false,
          };

    const experimentExecutionRequests =
      longHorizonPolicyAdaptedExperimentPortfolio
        .execution_request_generation_allowed === true &&
      selectionPolicyResearchEpoch.success !== false &&
      selectionPolicyCanary.success !== false &&
      persistentOrderingPolicyApplication.success !== false &&
      persistentOrderingPolicyRegressionMonitor.success !== false &&
      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed !== false &&
      persistentPolicyGenerationIntegrity.success !== false &&
      persistentPolicyGenerationIntegrity.execution_request_generation_allowed !== false &&
      persistentPolicyActivationGenerationIntegrity.success !== false &&
      persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed !== false &&
      rebasedSelectionPolicyChallenger.success !== false &&
      rebasedSelectionPolicyPromotionRequests.success !== false &&
      rebasedSelectionPolicyCanary.success !== false &&
      rebasedSelectionPolicyCanary.execution_request_generation_allowed !== false &&
      persistentPolicySuccessionRequests.success !== false
        ? await reconcileAvantiqoExperimentExecutionRequests()
        : {
            success: true,
            status:
              persistentPolicyActivationGenerationResearchIntegrity.success === false ||
              persistentPolicyActivationGenerationResearchIntegrity.research_generation_allowed === false
                ? "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"
                : selectionPolicyResearchEpoch.success === false
                  ? "BLOCKED_BY_SELECTION_POLICY_RESEARCH_EPOCH_FAIL_CLOSED"
                  : persistentOrderingPolicyRegressionMonitor.success === false ||
                      persistentOrderingPolicyRegressionMonitor.execution_request_generation_allowed === false
                    ? "BLOCKED_BY_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR"
                    : persistentOrderingPolicyApplication.success === false
                      ? "BLOCKED_BY_PERSISTENT_ORDERING_POLICY_APPLICATION_FAIL_CLOSED"
                      : persistentPolicyGenerationIntegrity.success === false ||
                          persistentPolicyGenerationIntegrity.execution_request_generation_allowed === false
                        ? "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_INTEGRITY_FAIL_CLOSED"
                        : persistentPolicyActivationGenerationIntegrity.success === false ||
                            persistentPolicyActivationGenerationIntegrity.execution_request_generation_allowed === false
                          ? "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"
                          : rebasedSelectionPolicyChallenger.success === false
                            ? "BLOCKED_BY_REBASED_SELECTION_POLICY_CHALLENGER_FAIL_CLOSED"
                            : rebasedSelectionPolicyPromotionRequests.success === false
                              ? "BLOCKED_BY_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_FAIL_CLOSED"
                              : rebasedSelectionPolicyCanary.success === false ||
                                  rebasedSelectionPolicyCanary.execution_request_generation_allowed === false
                                ? "BLOCKED_BY_REBASED_SELECTION_POLICY_CANARY_FAIL_CLOSED"
                                : persistentPolicySuccessionRequests.success === false
                                  ? "BLOCKED_BY_PERSISTENT_POLICY_SUCCESSION_GOVERNANCE_FAIL_CLOSED"
                                  : selectionPolicyCanary.success === false
                                    ? "BLOCKED_BY_SELECTION_POLICY_CANARY_FAIL_CLOSED"
                                    : "BLOCKED_PENDING_STABLE_LONG_HORIZON_POLICY_ADAPTED_PORTFOLIO",
            execution_request_count: 0,
            execution_authorized: false,
            spend_authorized: false,
          };

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
        experiment_portfolio_performance: experimentPortfolioPerformance,
        long_horizon_policy_adapted_experiment_portfolio:
          longHorizonPolicyAdaptedExperimentPortfolio,
        persistent_policy_activation_generation_research_integrity:
          persistentPolicyActivationGenerationResearchIntegrity,
        selection_policy_research_epoch: selectionPolicyResearchEpoch,
        rebased_selection_policy_challenger: rebasedSelectionPolicyChallenger,
        rebased_selection_policy_promotion_requests:
          rebasedSelectionPolicyPromotionRequests,
        rebased_selection_policy_canary: rebasedSelectionPolicyCanary,
        persistent_policy_succession_requests: persistentPolicySuccessionRequests,
        persistent_policy_generation_integrity: persistentPolicyGenerationIntegrity,
        persistent_policy_activation_generation_integrity:
          persistentPolicyActivationGenerationIntegrity,
        selection_policy_shadow_challenger: selectionPolicyShadowChallenger,
        selection_policy_shadow_evaluation_integrity:
          selectionPolicyShadowEvaluationIntegrity,
        selection_policy_promotion_requests: selectionPolicyPromotionRequests,
        selection_policy_canary: selectionPolicyCanary,
        selection_policy_canary_outcome_certification:
          selectionPolicyCanaryOutcomeCertification,
        persistent_ordering_policy_promotion_requests:
          persistentOrderingPolicyPromotionRequests,
        persistent_ordering_policy_application:
          persistentOrderingPolicyApplication,
        persistent_ordering_policy_regression_monitor:
          persistentOrderingPolicyRegressionMonitor,
        calibration_backfilled_experiment_portfolio:
          calibrationBackfilledExperimentPortfolio,
        active_experiment_selection: activeExperimentSelection,
        estimator_calibrated_selection_guard: estimatorCalibratedSelectionGuard,
        assessor_calibrated_estimator_selection_guard:
          assessorCalibratedEstimatorSelectionGuard,
        experiment_execution_requests: experimentExecutionRequests,
      },
      {
        status:
          result.success === false ||
          longHorizonPolicyAdaptedExperimentPortfolio.success === false ||
          persistentPolicyActivationGenerationResearchIntegrity.success === false ||
          selectionPolicyResearchEpoch.success === false ||
          rebasedSelectionPolicyChallenger.success === false ||
          rebasedSelectionPolicyPromotionRequests.success === false ||
          rebasedSelectionPolicyCanary.success === false ||
          persistentPolicySuccessionRequests.success === false ||
          persistentPolicyGenerationIntegrity.success === false ||
          persistentPolicyActivationGenerationIntegrity.success === false ||
          selectionPolicyShadowChallenger.success === false ||
          selectionPolicyShadowEvaluationIntegrity.success === false ||
          selectionPolicyPromotionRequests.success === false ||
          selectionPolicyCanary.success === false ||
          selectionPolicyCanaryOutcomeCertification.success === false ||
          persistentOrderingPolicyPromotionRequests.success === false ||
          persistentOrderingPolicyApplication.success === false ||
          persistentOrderingPolicyRegressionMonitor.success === false
            ? 207
            : 200,
      },
    );
  } catch (error) {
    console.error("AVANTIQO_CONTINUOUS_LEARNING_CRON_FAILED", error);
    return Response.json(
      { success: false, error: error?.message || "Continuous learning failed" },
      { status: 500 },
    );
  }
}