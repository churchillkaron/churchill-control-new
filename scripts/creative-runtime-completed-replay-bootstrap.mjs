import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "true";
process.env.CREATIVE_ZERO_COST_PROVIDER_FIREWALL_AUTHORIZED = "true";
process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

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
  "@/lib/creative/director/runtime/CreativeFreshDirectionReferenceNormalizationRuntime"
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
await import(
  "@/lib/creative/director/runtime/CreativePromptlessDirectionSpecRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeRevokedDirectionFieldScrubRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeEvidenceConstrainedDirectionRuntime"
);

// The source evidence gate has already passed for every shot. This outer local
// craft layer now gives the truthful plan a distinctive campaign idea, seven
// differentiated chapters and thirteen varied editorial camera treatments.
// It changes no source binding, timing, provider workload or physical content.
await import(
  "@/lib/creative/director/runtime/CreativeEvidenceNarrativeCraftRuntime"
);

// Install outermost. The evidence-constrained and narrative-crafted plan is
// complete. This final source-locked layer removes every remaining legacy
// identity-profile, atlas and keyframe-generation binding while preserving
// real source references and visible-person continuity.
await import(
  "@/lib/creative/director/runtime/CreativeSourceLockedIdentityRequirementScrubRuntime"
);
