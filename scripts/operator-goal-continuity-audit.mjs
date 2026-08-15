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
  objective: "Prepare a launch campaign with the user",
  status: "active",
  success_criteria: ["Campaign approved", "Channel assets ready"],
  constraints: ["Do not publish without approval"],
  decisions: ["Lead with the customer story"],
  completed_steps: ["Audience agreed"],
  progress_summary: "The audience and message are agreed.",
  next_step: "Draft the channel concepts",
  open_questions: ["Which launch date should the plan use?"],
  blocker: null,
  user_confirmed_complete: false,
});

assert.equal(established.status, "active");
assert.equal(established.objective, "Prepare a launch campaign with the user");
assert.deepEqual(established.constraints, ["Do not publish without approval"]);

const partial = normalizeOperatorProjectState(
  {
    progress_summary: "Three channel concepts are now drafted.",
    completed_steps: ["Audience agreed", "Concepts drafted"],
  },
  { previousState: established },
);

assert.equal(partial.objective, established.objective);
assert.equal(partial.status, "active");
assert.deepEqual(partial.success_criteria, established.success_criteria);
assert.deepEqual(partial.constraints, established.constraints);
assert.equal(partial.progress_summary, "Three channel concepts are now drafted.");

const unconfirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: false,
  },
  { previousState: partial },
);

assert.equal(unconfirmedCompletion.status, "awaiting_confirmation");
assert.equal(unconfirmedCompletion.user_confirmed_complete, false);

const confirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: true,
  },
  { previousState: unconfirmedCompletion },
);

assert.equal(confirmedCompletion.status, "completed");
assert.equal(confirmedCompletion.user_confirmed_complete, true);

const replacement = normalizeOperatorProjectState(
  {
    objective: "Plan a customer retention workshop",
    status: "discussing",
  },
  { previousState: confirmedCompletion },
);

assert.deepEqual(replacement.success_criteria, []);
assert.deepEqual(replacement.decisions, []);
assert.equal(replacement.progress_summary, null);
assert.equal(replacement.user_confirmed_complete, false);

const merged = mergeOperatorProjectState(established, partial, {
  last_intent: "plan",
});

assert.equal(merged.objective, established.objective);
assert.equal(merged.last_intent, "plan");
assert.ok(Number.isFinite(Date.parse(merged.updated_at)));

assert.equal(OPERATOR_AUTONOMOUS_RUN_MAX_STEPS, 6);
const autonomousRun = createOperatorAutonomousRun({
  objective: "Check inventory and create a purchase action if required",
  evidenceSteps: [
    {
      id: "inventory_read",
      label: "Check inventory",
      capability_key: "inventory.stock.list",
      status: "completed",
    },
  ],
  pendingExecution: {
    capability_key: "procurement.purchase_order.create",
    description: "Create the requested purchase order",
    verify_after: {
      capability_key: "procurement.purchase_order.get",
      description: "Verify the purchase order exists",
    },
  },
});
assert.equal(autonomousRun.status, "awaiting_confirmation");
assert.equal(autonomousRun.current_step_id, "requested_action");
assert.deepEqual(autonomousRun.completed_steps, ["inventory_read"]);
assert.ok(autonomousRun.planned_steps.length <= OPERATOR_AUTONOMOUS_RUN_MAX_STEPS);

const cancelledRun = transitionOperatorAutonomousRun(autonomousRun, {
  status: "cancelled",
  stepId: "requested_action",
  stepStatus: "cancelled",
  blocker: "User cancelled the pending action",
});
assert.equal(cancelledRun.status, "cancelled");
assert.equal(cancelledRun.current_step_id, null);
assert.equal(
  cancelledRun.planned_steps.find((step) => step.id === "requested_action")?.status,
  "cancelled",
);

const [
  reasoningSource,
  verificationSource,
  turnRuntimeSource,
  autonomousRunSource,
  routeSource,
  homeSource,
  voiceSource,
  registryRuntimeSource,
  registryBridgeSource,
  capabilityCatalogSource,
  readChainSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorVerificationRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("lib/operator/contracts/OperatorAutonomousRun.js", "utf8"),
  readFile("app/api/operator/turn/route.js", "utf8"),
  readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8"),
  readFile("components/operator/LocalHeyAvantiqoWakeBridge.jsx", "utf8"),
  readFile("lib/platform/registry/OperatorRegistryDomainRuntimes.js", "utf8"),
  readFile("lib/platform/registry/operatorRegistryBridge.js", "utf8"),
  readFile("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8"),
  readFile("lib/platform/capabilities/createOperatorReadChainCapability.js", "utf8"),
]);

assert.match(
  reasoningSource,
  /current_project_state:\s*normalizeOperatorProjectState\(projectState\)/,
);
assert.match(reasoningSource, /user_confirmed_complete/);
assert.match(reasoningSource, /awaiting_confirmation/);
assert.match(reasoningSource, /assistant-only recommendation is not yet a decision/);
assert.match(reasoningSource, /Add or update project_state\.decisions only when the user clearly accepts/);
assert.match(reasoningSource, /context_scope/);
assert.match(reasoningSource, /function executionNeedsEntity/);
assert.match(reasoningSource, /function entityContextClarification/);
assert.match(reasoningSource, /Which legal entity should I use for this request\?/);
assert.match(reasoningSource, /entity_scope_guard:\s*true/);
assert.match(reasoningSource, /Apply the same rule to every child capability inside platform\.operator_read_chain\.execute/);
assert.match(reasoningSource, /const guardedParsed = executionNeedsEntity\(parsed, capabilities, entityId\)/);

assert.match(verificationSource, /function verifiedProjectState/);
assert.match(verificationSource, /goal_update\.applies/);
assert.match(verificationSource, /completed_step/);
assert.match(verificationSource, /progress_summary/);
assert.match(verificationSource, /Never add or change decisions here/);
assert.match(verificationSource, /Never declare the overall goal completed here/);
assert.match(verificationSource, /goal_continuity:\s*true/);
assert.match(verificationSource, /project_state:\s*verifiedProjectState\(projectState, parsed \|\| \{\}\)/);
assert.match(verificationSource, /COLLECTION_WRAPPER_KEYS/);
assert.match(verificationSource, /"data"/);
assert.match(verificationSource, /function normalizedCollectionEvidence/);
assert.match(verificationSource, /collection_path/);
assert.match(verificationSource, /rows_key/);
assert.match(verificationSource, /total_count:\s*rows\.length/);
assert.match(verificationSource, /complete_collection:\s*rows\.length <= EVIDENCE_SAMPLE_SIZE/);
assert.match(verificationSource, /never treat the sample as the full dataset/i);
assert.match(verificationSource, /do not infer prevalence, frequency, majority, ranking, trend, or dataset-wide importance from the sample alone/i);
assert.match(verificationSource, /If the original request asks for interpretation, advice, meaning, risk, opportunity, a judgment, or what to do next/i);
assert.match(verificationSource, /Separate evidence-backed fact from inference/i);
assert.match(verificationSource, /Do not invent a benchmark, target, budget, expected outcome, causal explanation, or industry norm/i);
assert.match(verificationSource, /choose one best safe next step/i);
assert.match(verificationSource, /interpretive_synthesis:\s*true/);
assert.match(verificationSource, /evidence_compaction:\s*"collection-aware-v1"/);
assert.match(verificationSource, /function supportedPendingExecution/);
assert.match(verificationSource, /readChainCompleted\(result\)/);
assert.match(verificationSource, /object\(parsed\?\.follow_up\)\.supported !== true/);
assert.match(verificationSource, /pending_execution:\s*pendingExecution/);
assert.match(verificationSource, /The user must still explicitly confirm/);
assert.match(verificationSource, /evidence_gated_follow_up:\s*Boolean\(staged\)/);
assert.match(verificationSource, /verify_after:\s*normalizedVerificationRead/);
assert.match(verificationSource, /post_action_verification_aware:\s*true/);
assert.match(verificationSource, /do not claim the intended business effect was independently confirmed/i);
assert.match(verificationSource, /createOperatorAutonomousRun/);
assert.match(verificationSource, /agreementWithAutonomousRun/);
assert.match(verificationSource, /bounded_autonomous_run:\s*Boolean\(staged\)/);

assert.match(readChainSource, /function preflightFollowUp/);
assert.match(readChainSource, /FOLLOW_UP_MUST_BE_ACTION/);
assert.match(readChainSource, /FOLLOW_UP_PERMISSION_REQUIRED/);
assert.match(readChainSource, /requires_confirmation:\s*true/);
assert.match(readChainSource, /staged_follow_up/);
assert.match(readChainSource, /this capability never executes it/i);
assert.match(readChainSource, /function preflightVerificationRead/);
assert.match(readChainSource, /verify_after/);
assert.match(readChainSource, /post-action-verification/);
assert.doesNotMatch(
  readChainSource,
  /executeUbteCapability\([^)]*followUp/s,
);

assert.match(autonomousRunSource, /const MAX_RUN_STEPS = 6/);
assert.match(autonomousRunSource, /awaiting_confirmation/);
assert.match(autonomousRunSource, /awaiting_approval/);
assert.match(autonomousRunSource, /superseded/);
assert.match(autonomousRunSource, /createOperatorAutonomousRun/);
assert.match(autonomousRunSource, /transitionOperatorAutonomousRun/);
assert.doesNotMatch(autonomousRunSource, /payload/);

assert.match(turnRuntimeSource, /function normalizedPendingVerificationRead/);
assert.match(turnRuntimeSource, /function runPendingPostActionVerification/);
assert.match(turnRuntimeSource, /item\.mode === "read"/);
assert.match(turnRuntimeSource, /post_action_verification/);
assert.match(turnRuntimeSource, /result:\s*verificationResult/);
assert.match(turnRuntimeSource, /POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE/);
assert.match(turnRuntimeSource, /function agreementWithRunTransition/);
assert.match(turnRuntimeSource, /function clearPendingAndSupersedeRun/);
assert.match(turnRuntimeSource, /function completedAgreementState/);
assert.match(turnRuntimeSource, /status:\s*"superseded"/);
assert.match(turnRuntimeSource, /status:\s*"awaiting_approval"/);
assert.match(turnRuntimeSource, /status:\s*"completed"/);

assert.match(registryRuntimeSource, /erpRegistry\.js/);
assert.match(registryRuntimeSource, /serializeCapability/);
assert.match(registryRuntimeSource, /serializeCapability\(ERP_REGISTRY\)/);
assert.doesNotMatch(registryRuntimeSource, /erpRegistry\.base\.js/);
assert.match(registryBridgeSource, /function contextScope\(item\)/);
assert.match(registryBridgeSource, /contextScope:\s*scope/);
assert.match(registryBridgeSource, /OPERATOR_ENTITY_CONTEXT_REQUIRED/);
assert.match(registryBridgeSource, /scope === "entity" && !text\(context\?\.entityId\)/);
assert.match(capabilityCatalogSource, /function normalizeContextScope\(value\)/);
assert.match(capabilityCatalogSource, /context_scope:\s*normalizeContextScope/);

assert.match(routeSource, /projectState:\s*memory\.projectState/);
assert.match(routeSource, /mergeOperatorProjectState/);
assert.match(routeSource, /agreementState:\s*nextAgreementState/);
assert.match(homeSource, /setProjectState\(result\?\.project_state/);
assert.match(homeSource, /Current goal/);
assert.match(voiceSource, /conversationKey:\s*"primary"/);
assert.match(voiceSource, /await speakRecovery\(\)/);
assert.match(voiceSource, /if \(enabledRef\.current\) \{\s*armCommandMode\(\)/);

console.log("OPERATOR_GOAL_CONTINUITY_AUDIT=PASS");
console.log("OPERATOR_GOAL_STATE_OWNER=OperatorProjectState");
console.log("OPERATOR_GOAL_COMPLETION=USER_CONFIRMATION_REQUIRED");
console.log("OPERATOR_STRATEGIC_MEMORY=WORKING_DIRECTION_WITH_USER_DECISIONS_SEPARATE");
console.log("OPERATOR_VERIFIED_EXECUTION_MEMORY=COMPLETED_STEP_PROGRESS_NEXT_STEP");
console.log("OPERATOR_READ_EVIDENCE=NESTED_COLLECTION_AWARE_BOUNDED_SAMPLE");
console.log("OPERATOR_READ_SAMPLE_GUARD=NO_DATASET_TOTALS_OR_TRENDS_FROM_PARTIAL_SAMPLE");
console.log("OPERATOR_VERIFIED_READ_INTERPRETATION=FACT_INFERENCE_RECOMMENDATION_SEPARATED");
console.log("OPERATOR_RECOMMENDATION_GUARD=NO_INVENTED_BENCHMARKS_ONE_SAFE_NEXT_STEP");
console.log("OPERATOR_REGISTRY_SOURCE=CANONICAL_CONVERGED_ERP");
console.log("OPERATOR_CONTEXT_SCOPE=DECLARED_AND_ENTITY_GUARDED");
console.log("OPERATOR_REASONING_ENTITY_SCOPE=VISIBLE_AND_CLARIFIED_BEFORE_EXECUTION");
console.log("OPERATOR_READ_CHAIN_ENTITY_SCOPE=CHILD_CAPABILITIES_GUARDED");
console.log("OPERATOR_EVIDENCE_GATED_ACTION=STAGED_THEN_USER_CONFIRMED");
console.log("OPERATOR_EVIDENCE_GATED_ACTION_GUARD=NO_AUTOWRITE_EXACT_PAYLOAD_ONLY");
console.log("OPERATOR_POST_ACTION_VERIFICATION=REGISTERED_READ_AFTER_CONFIRMED_WRITE");
console.log("OPERATOR_POST_ACTION_VERIFICATION_GUARD=NO_EFFECT_CLAIM_WITHOUT_FRESH_READ");
console.log("OPERATOR_AUTONOMOUS_RUN=BOUNDED_DURABLE_CONTINUATION_STATE");
console.log("OPERATOR_AUTONOMOUS_RUN_MAX_STEPS=6");
console.log("OPERATOR_AUTONOMOUS_RUN_STOP_GATES=CONFIRMATION_APPROVAL_VERIFICATION_SUPERSESSION");
console.log("OPERATOR_AUTONOMOUS_RUN_PAYLOAD_OWNER=PENDING_EXECUTION_ONLY");
console.log("OPERATOR_GOAL_SURFACES=TEXT_AND_VOICE_PRIMARY_CONVERSATION");
console.log("OPERATOR_VOICE_FAILURE=ALWAYS_AUDIBLE_WITH_FOLLOW_UP");
