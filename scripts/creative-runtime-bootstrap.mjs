import {
  loadAvantiqoEnv,
} from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

await import(
  "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"
);
await import(
  "@/lib/creative/reasoning/runtime/CreativeReasoningRequestCostEstimateRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime"
);
await import(
  "@/lib/creative/reasoning/runtime/CreativeReasoningBudgetRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionCompletedBudgetRecoveryRuntime"
);
await import(
  "@/lib/creative/assets/runtime/CreativeLongFormAssetSelectionSanitizerRuntime"
);
await import(
  "@/lib/creative/assets/runtime/CreativeStrictOriginalSourceSelectionRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeMeasuredValidatedDossierRecoveryGate"
);
await import(
  "@/lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap"
);
await import(
  "@/lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime"
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
  "@/lib/creative/director/runtime/CreativeGenericDirectionCompletionRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionJsonContractRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionSanitizedAssetRecoveryRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeConceptPlanRevisionStructureRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionScopedUsageLookupRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeConceptResponseRepairRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeProductionCurrencyRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeValidatedDossierPlanRecoveryRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeTemporalSemanticIntentEvidenceRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeTemporalSemanticPlanGateRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeTemporalRoleLanguagePolishRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeTemporalSemanticReplanConvergenceRuntimeV2"
);
await import(
  "@/lib/creative/director/runtime/CreativeValidatedDossierReplanConvergenceRuntime"
);
await import(
  "@/lib/creative/execution/runtime/CreativeProductionTaskActiveGraphScopeRuntime"
);
await import(
  "@/lib/creative/post-production/runtime/CreativeTemporalBrandEndCardRuntime"
);
await import(
  "@/lib/creative/production-graph/runtime/CreativeProductionPlanRecordConvergenceRuntime"
);
await import(
  "@/lib/creative/production-graph/runtime/CreativeProductionGraphReadinessRuntime"
);
await import(
  "@/lib/creative/production-graph/runtime/CreativeProductionReadinessErrorBoundaryRuntime"
);