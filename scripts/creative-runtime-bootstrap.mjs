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

// Install paid approval inside reasoning-budget execution. Requests that are
// not replayed therefore remain fully governed, priced, charged and settled.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime"
);

// Mirror the remaining Node runtime stack installed by instrumentation.js so
// the isolated CLI exercises the same Creative Studio backend as the UI.
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

// Harden only the production critic provider request. It remains inside replay,
// so source sequence 16 is regenerated through the normal paid approval stack.
await import(
  "@/lib/creative/director/runtime/CreativeConceptCriticCoverageRuntime"
);

// Deterministic replay sits inside local result completion. Replayed raw usage
// payloads therefore receive exactly the same completion and normalization as
// provider responses, while skipped/new calls continue through cost approval.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionAttemptReplayRuntime"
);

// Complete exact provider or replayed direction payloads locally before strict
// validation. Exact-hash recovery remains disabled by the execution command;
// deterministic attempt replay is the only authorized reuse path.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);

// Complete both under-specified and placeholder-style provider direction
// locally before the strict master-plan validator runs.
await import(
  "@/lib/creative/director/runtime/CreativeGenericDirectionCompletionRuntime"
);

// Install prompt normalization last so every logical request has its canonical
// input before completion, replay dispatch, budget accounting and execution.
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);
