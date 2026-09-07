import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    await import(
      "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"
    );
    await import(
      "@/lib/creative/assets/isolation/runtime/CreativeShotPrimarySourceDispatchGate"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap"
    );
    await import(
      "@/lib/creative/performance/runtime/CreativeHumanPerformancePlanningBootstrap"
    );
    await import(
      "@/lib/creative/vfx/runtime/CreativeVfxPlanningBootstrap"
    );
    await import(
      "@/lib/creative/simulation/runtime/CreativeSimulationPlanningBootstrap"
    );
    await import(
      "@/lib/creative/compositing/runtime/CreativeCompositingPlanningBootstrap"
    );
    await import(
      "@/lib/creative/performance/runtime/CreativeHumanPerformanceExecutionGate"
    );
    await import(
      "@/lib/creative/vfx/runtime/CreativeVfxExecutionGate"
    );
    await import(
      "@/lib/creative/simulation/runtime/CreativeSimulationExecutionGate"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeAerialCinematographyExecutionGate"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeCameraGrammarExecutionGate"
    );
    await import(
      "@/lib/creative/identity/runtime/CreativeHumanContinuityQualityBootstrap"
    );
    await import(
      "@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetSemanticCoverageRuntime"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeFreshDirectionReferenceContractRuntime"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeCanonicalShotSourceRuntime"
    );
    await import(
      "@/lib/creative/reasoning/runtime/CreativeReasoningRequestCostEstimateRuntime"
    );
    await import(
      "@/lib/creative/reasoning/runtime/CreativeReasoningBudgetRuntime"
    );
    await import(
      "@/lib/creative/audio/runtime/CreativeTemporalSoundtrackGraphRuntime"
    );
    await import(
      "@/lib/creative/audio/runtime/CreativeTemporalSoundtrackCueSheetRuntime"
    );
    await import(
      "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationGraphRuntime"
    );
    await import(
      "@/lib/creative/production/review/runtime/CreativeProductionTaskReviewSettlementGate"
    );
    await import(
      "@/lib/creative/vfx/runtime/CreativeVfxQualityGateBootstrap"
    );
    await import(
      "@/lib/creative/simulation/runtime/CreativeSimulationQualityGateBootstrap"
    );
    await import(
      "@/lib/creative/continuity/runtime/CreativeContinuityQualityGateBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeWorldClassQualityBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeGeneratedMediaRecoveryBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualCostPlanningBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeCinemaEndpointFidelityExecutionGate"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativePerceptualPairRecoveryBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeCinemaRepairContinuityBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeOwnedCinemaRepairProviderPolicyBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeHumanTemporalSpanRepairBootstrap"
    );
    await import(
      "@/lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap"
    );
    await import(
      "@/lib/creative/continuity/runtime/CreativeContinuityQcAuthorityGuardBootstrap"
    );
    await import(
      "@/lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate"
    );
    await import(
      "@/lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap"
    );
    await import(
      "@/lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap"
    );
    await import(
      "@/lib/creative/compositing/runtime/CreativeProjectCompositingBootstrap"
    );
    await import(
      "@/lib/creative/post-production/runtime/CreativeEditorialAssemblyRenderBootstrap"
    );
    await import(
      "@/lib/creative/audio/runtime/CreativeMasterSoundtrackRenderGate"
    );
    await import(
      "@/lib/creative/post-production/runtime/CreativeProfessionalFinishingBootstrap"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
    );
    await import(
      "@/lib/creative/assets/intelligence/runtime/CreativeSourceSemanticProductionGateRuntime"
    );
    await import(
      "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityBootstrap"
    );
    await import(
      "@/lib/creative/quality/runtime/CreativeBrandFidelityPerceptualReviewRuntime"
    );
    await import(
      "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityExecutionGate"
    );
    await import(
      "@/lib/creative/release/runtime/CreativeSingleMediaAuthorizationDispatchRuntime"
    );
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;