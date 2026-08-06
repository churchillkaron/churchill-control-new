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
      "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationGraphRuntime"
    );
    await import(
      "@/lib/creative/production/review/runtime/CreativeProductionTaskReviewSettlementGate"
    );
    await import(
      "@/lib/creative/audio/runtime/CreativeMasterSoundtrackRenderGate"
    );
    await import(
      "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
    );
    await import(
      "@/lib/creative/assets/intelligence/runtime/CreativeSourceSemanticProductionGateRuntime"
    );
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
