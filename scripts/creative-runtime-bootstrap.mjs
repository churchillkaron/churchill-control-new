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

// The recovery layer reuses only an exact completed reasoning request; it
// cannot substitute one concept, critic or scene response for another.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);

// Install this last so short-form prompt normalization occurs before request
// hashing, recovery, budget accounting and provider execution.
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);
