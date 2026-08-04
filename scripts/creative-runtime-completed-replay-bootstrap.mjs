import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

// The direction-only entrypoint requires this flag before it begins. Actual
// provider and settlement execution remains blocked by the zero-cost firewall
// installed below, beneath deterministic completed-result replay.
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "true";
process.env.CREATIVE_ZERO_COST_PROVIDER_FIREWALL_AUTHORIZED = "true";
process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

// Install the firewall first. Every later wrapper captures this blocked base
// execution path. Completed replay returns before reaching it; any unexpected
// new execution or settlement request is rejected before usage creation,
// wallet reservation, provider selection or provider invocation.
await import(
  "@/lib/creative/director/runtime/CreativeZeroCostProviderFirewallRuntime"
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
  "@/lib/creative/director/runtime/CreativeDirectionCompletedReplayRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeCouncilRevisionStructureRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeGenericDirectionCompletionRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);
