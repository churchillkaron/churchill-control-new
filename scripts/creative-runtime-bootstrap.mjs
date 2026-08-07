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

// Deterministic replay sits inside local result validation. Replayed raw usage
// payloads therefore receive exactly the same validation and normalization as
// provider responses, while skipped/new calls continue through cost approval.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionAttemptReplayRuntime"
);

// Validate exact provider or replayed direction payloads locally before strict
// release checks. Exact-hash recovery remains disabled by the execution command;
// deterministic attempt replay is the only authorized reuse path.
await import(
  "@/lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime"
);

// The legacy generic-direction completion decorator was retired after master
// plan completion converged on the frozen V3 validation-only contract. Approved
// story authority must never be rewritten by CLI bootstrap side effects.

// Install prompt normalization last so every logical request has its canonical
// input before validation, replay dispatch, budget accounting and execution.
await import(
  "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime"
);

// Install source semantic validation after every production-graph decorator so
// both preview and materialization fail before graph construction when any raw
// source asset lacks provider-verified visual evidence.
await import(
  "@/lib/creative/assets/intelligence/runtime/CreativeSourceSemanticProductionGateRuntime"
);