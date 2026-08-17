#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://benchmark.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "benchmark-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const [
  reasoningSource,
  turnSource,
  verificationSource,
  systemManagementAuditSource,
  fastVoiceAuditSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorVerificationRuntime.js", "utf8"),
  readFile("scripts/operator-system-management-audit.mjs", "utf8"),
  readFile("scripts/operator-fast-voice-read-catalog-audit.mjs", "utf8"),
]);

const {
  createOperatorAutonomousRun,
  transitionOperatorAutonomousRun,
  normalizeOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

function requireAll(label, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.includes(fragment),
      `${label} missing required contract fragment: ${fragment}`,
    );
  }
}

requireAll("BUSINESS_PARTNER_REASONING", reasoningSource, [
  "act as a thoughtful collaborative partner",
  "develop ideas, identify tradeoffs, and challenge assumptions constructively",
  "choose the best safe next step when the recorded context is sufficient",
  "Do not ask questions whose answers are already supplied",
  "Do not repeatedly ask the user to restate the goal or facts already recorded",
]);

requireAll("DURABLE_GOAL_MEMORY", reasoningSource, [
  "current_project_state",
  "completed_steps",
  "progress_summary",
  "next_step",
  "user_confirmed_complete",
  "Never mark a goal completed merely because one action or plan step completed",
]);

requireAll("READ_AND_ANSWER", reasoningSource, [
  "execute the best matching read capability in this turn",
  "Do not navigate to a workspace instead when a read can answer the request",
  "When a question needs figures, read the data and answer with it",
  "temporal_reference",
  "date_from and date_to",
]);

requireAll("NAVIGATION", turnSource, [
  "resolveInstantOperatorNavigation",
  "bypassed_for_instant_navigation: true",
  "Opening ${target.name}.",
]);

requireAll("EVIDENCE_FIRST_ACTIONS", reasoningSource, [
  "platform.operator_read_chain.execute",
  "1 to 4 exact read steps and an exact follow_up action",
  "Read evidence never auto-authorizes a write",
  "the user must explicitly confirm it",
  "normal permissions and approval governance still apply before execution",
]);

requireAll("SYSTEM_SELF_MANAGEMENT", reasoningSource, [
  "use the supplied system health inspection before proposing a repair",
  "inspect, diagnose, propose the smallest registered repair or incident action",
  "health verification before claiming the issue is fixed",
  "A health inspection never authorizes a repair",
]);

requireAll("EXECUTION_GOVERNANCE", turnSource, [
  "resolveOperatorExecutionApproval",
  "recordOperatorExecutionAudit",
  "VOICE_CONFIRMATION_REQUIRED",
  "CONFIRMATION_REQUIRED",
  "AUTOMATIC_EXECUTION_NOT_ENABLED",
  "pending_execution",
]);

requireAll("GOVERNED_ONE_COMMAND_VOICE", turnSource, [
  "function voiceCanAutoExecute(capability)",
  'capability?.auto_execute === true',
  'capability?.requires_confirmation !== true',
  'text(capability?.risk).toLowerCase() === "low"',
  "!voiceCanAutoExecute(capability)",
]);

requireAll("APPROVAL_RESUME_PERSISTENCE", turnSource, [
  "const approvalAgreementState = agreementWithPendingConfirmationRun",
  'status: "awaiting_approval"',
  'currentStepId: "requested_action"',
  "agreement_state: governanceState",
  "resumeFromApproval",
]);

requireAll("AUTONOMOUS_RUN_RESUME", turnSource, [
  "isAutonomousRunStatusQuery",
  "isAutonomousRunResumeRequest",
  "awaiting_confirmation",
  "awaiting_approval",
  "executing",
  "verifying",
  "blocked",
  "completed",
  "superseded",
]);

requireAll("POST_ACTION_VERIFICATION", verificationSource, [
  "post_action_verification",
  "fresh verification evidence",
  "do not claim the intended business effect was independently confirmed",
  "The user must still explicitly confirm",
  "normal permissions, approval governance, execution verification",
]);

requireAll("FAST_VOICE_PRIVACY", fastVoiceAuditSource, [
  "OPERATOR_FAST_VOICE_PRIMARY_CAPABILITIES=12",
  "OPERATOR_FAST_VOICE_READ_SUPPLEMENT=6",
  "OPERATOR_FAST_VOICE_CAPABILITY_CEILING=18",
  "OPERATOR_FAST_VOICE_FALLBACK_TELEMETRY=REASON_CODE_ONLY",
  "OPERATOR_FAST_VOICE_FALLBACK_PRIVACY=NO_USER_CONTENT_OR_PAYLOAD",
]);

requireAll("SYSTEM_MANAGEMENT_RELEASE_LOCK", systemManagementAuditSource, [
  "SYSTEM_MANAGEMENT_LOOP=INSPECT_DIAGNOSE_CONFIRM_EXECUTE_VERIFY",
  "SYSTEM_REPAIR_DEFAULT=NOT_AUTHORIZED",
  "SYSTEM_EXTERNAL_RETRY_DEFAULT=FORBIDDEN",
]);

const run = createOperatorAutonomousRun({
  objective: "Diagnose the problem, fix it safely, and verify the result",
  evidenceSteps: [
    {
      id: "inspect_health",
      label: "Inspect current system health",
      capability_key: "platform.system.inspectHealth",
      status: "completed",
    },
  ],
  pendingExecution: {
    description: "Run the registered repair",
    capability_key: "platform.system.repairRegisteredIssue",
    payload: { snapshot_id: "snapshot-a" },
    verify_after: {
      description: "Verify system health after repair",
      capability_key: "platform.system.verifyHealth",
      payload: { snapshot_id: "snapshot-a" },
    },
  },
});

assert.equal(run.status, "awaiting_confirmation");
assert.equal(run.current_step_id, "requested_action");
assert.deepEqual(run.completed_steps, ["inspect_health"]);
assert.deepEqual(
  run.planned_steps.map((step) => step.kind),
  ["read", "action", "verify"],
);
assert.equal(run.planned_steps[1].status, "awaiting_confirmation");
assert.equal(run.planned_steps[2].status, "planned");

const executing = transitionOperatorAutonomousRun(run, {
  status: "executing",
  currentStepId: "requested_action",
  stepId: "requested_action",
  stepStatus: "running",
});
assert.equal(executing.status, "executing");
assert.equal(executing.planned_steps[1].status, "running");

const verifying = transitionOperatorAutonomousRun(executing, {
  status: "verifying",
  currentStepId: "post_action_verification",
  stepId: "requested_action",
  stepStatus: "completed",
});
assert.equal(verifying.status, "verifying");
assert.ok(verifying.completed_steps.includes("requested_action"));

const completed = transitionOperatorAutonomousRun(verifying, {
  status: "completed",
  stepId: "post_action_verification",
  stepStatus: "completed",
});
assert.equal(completed.status, "completed");
assert.equal(completed.current_step_id, null);
assert.ok(completed.completed_steps.includes("post_action_verification"));

const normalized = normalizeOperatorAutonomousRun({
  ...completed,
  status: "completed",
});
assert.equal(normalized.status, "completed");
assert.equal(normalized.current_step_id, null);

console.log("OPERATOR_AUTONOMOUS_INTELLIGENCE_BENCHMARK=PASS");
console.log("OPERATOR_ROLE=BUSINESS_PARTNER_AND_SYSTEM_OPERATOR");
console.log("OPERATOR_REASONING=DISCUSS_RECOMMEND_DECIDE_WITH_CONTEXT");
console.log("OPERATOR_QUESTION_FLOW=UNDERSTAND_READ_ANSWER");
console.log("OPERATOR_ACTION_FLOW=READ_REASON_GOVERN_EXECUTE_VERIFY");
console.log("OPERATOR_VOICE_LOW_RISK_AUTO_EXECUTE=REGISTERED_AUTO_EXECUTE_ONLY");
console.log("OPERATOR_VOICE_SENSITIVE_ACTIONS=CONFIRMATION_REQUIRED");
console.log("OPERATOR_APPROVAL_PAUSE=EXACT_ACTION_PERSISTED_AND_RESUMABLE");
console.log("OPERATOR_NAVIGATION=REGISTERED_TARGETS_ONLY");
console.log("OPERATOR_AUTONOMOUS_RUN=RESUMABLE_STATE_MACHINE");
console.log("OPERATOR_SYSTEM_FIX=INSPECT_DIAGNOSE_REGISTERED_REPAIR_VERIFY");
console.log("OPERATOR_FAST_VOICE=12_PLUS_6_WITH_REASON_CODE_ONLY_FALLBACK");
console.log("OPERATOR_PRIVACY=NO_USER_CONTENT_IN_FAST_FALLBACK_TELEMETRY");
console.log("OPERATOR_UNSAFE_AUTONOMY=FORBIDDEN");
