import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  mergeOperatorProjectState,
  normalizeOperatorProjectState,
} = await import("@/lib/operator/contracts/OperatorProjectState");
const {
  OPERATOR_AUTONOMOUS_RUN_MAX_STEPS,
  createOperatorAutonomousRun,
  transitionOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

const established = normalizeOperatorProjectState({
  objective: "Complete the active business objective",
  status: "active",
  success_criteria: ["Outcome confirmed"],
  constraints: ["Do not execute governed actions without approval"],
  decisions: ["Use the registered execution path"],
  completed_steps: ["Context established"],
  progress_summary: "The objective is active.",
  next_step: "Continue with the next safe step",
  user_confirmed_complete: false,
});

assert.equal(established.status, "active");
assert.equal(established.user_confirmed_complete, false);

const partial = normalizeOperatorProjectState(
  {
    progress_summary: "Verified evidence was collected.",
    completed_steps: ["Context established", "Evidence collected"],
  },
  { previousState: established },
);
assert.equal(partial.objective, established.objective);
assert.deepEqual(partial.constraints, established.constraints);

const unconfirmed = normalizeOperatorProjectState(
  { status: "completed", user_confirmed_complete: false },
  { previousState: partial },
);
assert.equal(unconfirmed.status, "awaiting_confirmation");

const confirmed = normalizeOperatorProjectState(
  { status: "completed", user_confirmed_complete: true },
  { previousState: unconfirmed },
);
assert.equal(confirmed.status, "completed");
assert.equal(confirmed.user_confirmed_complete, true);

const merged = mergeOperatorProjectState(established, partial, {
  last_intent: "answer",
});
assert.equal(merged.objective, established.objective);
assert.equal(merged.last_intent, "answer");
assert.ok(Number.isFinite(Date.parse(merged.updated_at)));

assert.equal(OPERATOR_AUTONOMOUS_RUN_MAX_STEPS, 6);
const run = createOperatorAutonomousRun({
  objective: "Complete an evidence-gated action",
  evidenceSteps: [
    {
      id: "evidence_read",
      label: "Read registered evidence",
      capability_key: "domain.record.read",
      status: "completed",
    },
  ],
  pendingExecution: {
    capability_key: "domain.record.write",
    description: "Run the requested governed action",
    verify_after: {
      capability_key: "domain.record.read",
      description: "Verify the action effect",
    },
  },
});
assert.equal(run.status, "awaiting_confirmation");
assert.ok(run.planned_steps.length <= OPERATOR_AUTONOMOUS_RUN_MAX_STEPS);

const cancelled = transitionOperatorAutonomousRun(run, {
  status: "cancelled",
  stepId: "requested_action",
  stepStatus: "cancelled",
  blocker: "User cancelled",
});
assert.equal(cancelled.status, "cancelled");

const [
  reasoningSource,
  verificationSource,
  turnRuntimeSource,
  readChainSource,
  capabilityCatalogSource,
  readResolverSource,
  dataReflexSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorVerificationRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorReadChainCapability.js", "utf8"),
  readFile("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8"),
  readFile("lib/operator/runtime/OperatorBusinessReadResolver.js", "utf8"),
  readFile("lib/operator/runtime/OperatorBusinessDataReflex.js", "utf8"),
]);

assert.match(
  reasoningSource,
  /current_project_state:\s*normalizeOperatorProjectState\(projectState\)/,
);
assert.match(reasoningSource, /user_confirmed_complete/);
assert.match(reasoningSource, /awaiting_confirmation/);
assert.match(
  reasoningSource,
  /assistant-only recommendation is not yet a decision/i,
);
assert.match(reasoningSource, /Continue an active goal from the best safe next step/i);
assert.match(reasoningSource, /function executionNeedsEntity/);
assert.match(reasoningSource, /function readChainExecutionKeys/);
assert.match(reasoningSource, /function entityContextClarification/);
assert.match(reasoningSource, /read_chain_nested_entity_guard:\s*true/);
assert.match(reasoningSource, /do not construct the follow_up on the fast path/i);
assert.match(reasoningSource, /Read evidence never auto-authorizes a write/i);
assert.match(reasoningSource, /the user must explicitly confirm it/i);
assert.match(
  reasoningSource,
  /routeOperatorCognition\(\{ message, source, capabilities \}\)/,
);
assert.match(reasoningSource, /const useFastVoice = cognition\.path !== "deep"/);
assert.match(reasoningSource, /return "non_read_requires_deep"/);

assert.match(verificationSource, /function verifiedProjectState/);
assert.match(verificationSource, /goal_update\.applies/);
assert.match(verificationSource, /completed_step/);
assert.match(verificationSource, /progress_summary/);
assert.match(verificationSource, /Never add or change decisions here/);
assert.match(verificationSource, /function collectionOf\(value, depth = 0, path = \[\]\)/);
assert.match(verificationSource, /Object\.entries\(value\)/);
assert.match(verificationSource, /total_count:\s*rows\.length/);
assert.match(verificationSource, /complete_collection:\s*rows\.length <= EVIDENCE_SAMPLE_SIZE/);
assert.match(
  verificationSource,
  /evidence_compaction:\s*"collection-aware-dynamic-v2"/,
);
assert.doesNotMatch(verificationSource, /COLLECTION_KEYS/);
assert.doesNotMatch(verificationSource, /COLLECTION_WRAPPER_KEYS/);
assert.match(verificationSource, /function supportedPendingExecution/);
assert.match(verificationSource, /followUp\.request_aligned !== true/);
assert.match(verificationSource, /post_action_verification_aware:\s*true/);
assert.match(verificationSource, /bounded_autonomous_run:\s*Boolean\(staged\)/);

assert.match(readChainSource, /function operatorMode\(manifest = \{\}\)/);
assert.doesNotMatch(readChainSource, /function inferredMode/);
assert.doesNotMatch(readChainSource, /FULL_ACCESS_ROLES/);
assert.doesNotMatch(readChainSource, /COLLECTION_KEYS/);
assert.doesNotMatch(readChainSource, /COLLECTION_WRAPPER_KEYS/);
assert.match(readChainSource, /function arraySchemaPaths/);
assert.match(readChainSource, /output_schema:\s*outputSchema\(manifest\)/);
assert.match(readChainSource, /const \[followUpPreflight, preflight\] = await Promise\.all/);
assert.match(readChainSource, /const results = await Promise\.all/);
assert.match(readChainSource, /staged_follow_up/);
assert.match(readChainSource, /requires_confirmation:\s*true/);
assert.doesNotMatch(
  readChainSource,
  /executeUbteCapability\([^)]*followUp/s,
);

assert.match(capabilityCatalogSource, /manifest\.operatorMode/);
assert.match(capabilityCatalogSource, /operator_aliases:/);
assert.match(capabilityCatalogSource, /operator_examples:/);
assert.match(capabilityCatalogSource, /input_schema:/);
assert.match(capabilityCatalogSource, /output_schema:/);

assert.match(
  readResolverSource,
  /const OPERATOR_READ_CHAIN_KEY = "platform\.operator_read_chain\.execute"/,
);
assert.match(readResolverSource, /function diverseReads/);
assert.match(readResolverSource, /const groups = new Map\(\)/);
assert.match(
  readResolverSource,
  /const group = text\(capability\?\.domain\) \|\| "_"/,
);
assert.match(readResolverSource, /function readChainCapability/);
assert.doesNotMatch(
  readResolverSource,
  /revenue|profit|inventory|receivable|payable|payroll|customer|supplier|hotel|restaurant/i,
);

assert.match(dataReflexSource, /function schemaIsAutomatic\(capability\)/);
assert.match(dataReflexSource, /requiredFields\(capability\)\.length === 0/);
assert.match(dataReflexSource, /payload:\s*\{\}/);
assert.doesNotMatch(dataReflexSource, /function relativeDatePayload/);
assert.doesNotMatch(dataReflexSource, /function contextField/);
assert.doesNotMatch(dataReflexSource, /function zonedDateParts/);
assert.doesNotMatch(dataReflexSource, /function isoDateShift/);
assert.doesNotMatch(
  dataReflexSource,
  /date_from|date_to|from_date|to_date|start_date|end_date|\btoday\b|\byesterday\b/i,
);

assert.match(turnRuntimeSource, /createOperatorAutonomousRun/);
assert.match(turnRuntimeSource, /function runPendingPostActionVerification/);
assert.match(turnRuntimeSource, /POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE/);
assert.match(turnRuntimeSource, /function completedAgreementState/);
assert.match(turnRuntimeSource, /status:\s*"superseded"/);
assert.match(turnRuntimeSource, /resume_kind:\s*"verification"/);
assert.match(turnRuntimeSource, /pending\.original_message \|\| message/);
assert.match(turnRuntimeSource, /original_message:\s*text\(originalMessage\)/);

console.log("OPERATOR_GOAL_CONTINUITY_AUDIT=PASS");
console.log("OPERATOR_GOAL_COMPLETION=USER_CONFIRMATION_REQUIRED");
console.log("OPERATOR_GOAL_MEMORY=DURABLE_PROJECT_STATE");
console.log("OPERATOR_EXECUTION_GOVERNANCE=CONFIRMATION_APPROVAL_VERIFICATION");
console.log("OPERATOR_READ_EVIDENCE=DYNAMIC_COLLECTION_DISCOVERY");
console.log("OPERATOR_MULTI_READ=PARALLEL_REGISTERED_CAPABILITIES");
console.log("OPERATOR_MULTI_READ_CATALOG=DOMAIN_DIVERSE_RUNTIME_SELECTION");
console.log("OPERATOR_MULTI_READ_VOCABULARY=MANIFEST_DRIVEN");
console.log("OPERATOR_DATA_REFLEX=INPUT_FREE_REGISTERED_READS_ONLY");
console.log("OPERATOR_DATA_REFLEX_INPUT_BINDING=SCHEMA_REASONING_NOT_ALIAS_TABLES");
console.log("OPERATOR_FAST_EXECUTIVE_ACTIONS=DEEP_REASONING_FALLBACK");
