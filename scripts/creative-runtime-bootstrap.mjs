import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// Node --import modules execute before the command entrypoint. Load the same
// Next environment files here before importing runtimes that initialize the
// Supabase admin client at module evaluation time.
loadEnvConfig(process.cwd());

// Install the same foundational cost controls used by the UI server.
await import(
  "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"
);
await import(
  "@/lib/creative/reasoning/runtime/CreativeReasoningRequestCostEstimateRuntime"
);

// Install the CLI budget approval inside the reasoning-budget wrapper. The
// reasoning runtime then serializes parallel council calls before each one
// reads or updates the persisted approval balance.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime"
);

// Mirror the remaining Node runtime stack installed by instrumentation.js so
// the temporary CLI exercises the same Creative Studio backend as the UI.
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

// Complete both under-specified and placeholder-style provider direction
// locally before the strict master-plan validator runs.
await import(
  "@/lib/creative/director/runtime/CreativeGenericDirectionCompletionRuntime"
);

// Complete exact provider direction payloads locally before validation.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);

// Change only the production critic request contract. This sits inside replay,
// so sequence 16 can be deliberately regenerated while sequences 1-15 replay
// their exact settled usage results.
await import(
  "@/lib/creative/director/runtime/CreativeConceptCriticCoverageRuntime"
);

// Install prompt normalization before deterministic replay. Replay matches the
// recorded operation sequence and settled usage IDs, not volatile prompt hashes.
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);

// Install deterministic attempt replay last so it is the outermost direction
// layer. Replayed calls bypass cost approval and budget accounting; skipped or
// new calls continue through the full governed stack.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionAttemptReplayRuntime"
);
