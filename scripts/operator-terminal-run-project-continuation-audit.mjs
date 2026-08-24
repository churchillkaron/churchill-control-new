import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyPendingOperatorReply,
} from "../lib/operator/runtime/OperatorHumanDecisionClassifier.js";
import {
  normalizeOperatorAutonomousRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  operatorPendingExecutionMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} from "../lib/operator/contracts/OperatorAutonomousRun.js";

const legacyPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";
const [legacySource, coreSource] = await Promise.all([
  readFile(legacyPath, "utf8"),
  readFile(corePath, "utf8"),
]);

function requireFragments(path, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(legacyPath, legacySource, [
  "function normalizedPendingMessage(message, replyClass)",
  'if (replyClass === "resume") return "continue";',
]);

requireFragments(corePath, coreSource, [
  "const TERMINAL_AUTONOMOUS_RUN_STATUSES = new Set([",
  '"completed"',
  '"cancelled"',
  '"superseded"',
  "function hasContinuableProjectGoal(projectState = {})",
  "function shouldContinueProjectInsteadOfTerminalRun({",
  "TERMINAL_AUTONOMOUS_RUN_STATUSES.has(",
  "const continueProjectAfterTerminalRun =",
  "shouldContinueProjectInsteadOfTerminalRun({",
  "!continueProjectAfterTerminalRun",
  "const activeAgreementState = respondsToPending",
  "clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending))",
]);

const continuationDecisionStart = coreSource.indexOf(
  "const continueProjectAfterTerminalRun =",
);
const resumeDecisionStart = coreSource.indexOf(
  "const resumeRequested = Boolean(",
  continuationDecisionStart,
);
const pendingDecisionStart = coreSource.indexOf(
  "const respondsToPending = Boolean(",
  resumeDecisionStart,
);
const activeAgreementStart = coreSource.indexOf(
  "const activeAgreementState = respondsToPending",
  pendingDecisionStart,
);
assert.ok(continuationDecisionStart >= 0, "terminal project continuation decision must exist");
assert.ok(
  resumeDecisionStart > continuationDecisionStart,
  "terminal project continuation must be resolved before run resume",
);
assert.ok(
  pendingDecisionStart > resumeDecisionStart,
  "pending execution classification must happen after terminal-vs-run continuation split",
);
assert.ok(
  activeAgreementStart > pendingDecisionStart,
  "stale pending cleanup must happen after pending reply classification",
);

const localizedResumeCases = [
  ["sv", "fortsätt"],
  ["de", "mach weiter"],
  ["fr", "reprends"],
  ["es", "continúa"],
  ["th", "ทำต่อ"],
];

for (const [language, message] of localizedResumeCases) {
  assert.equal(
    classifyPendingOperatorReply({
      message,
      pending: false,
      recommendation: false,
    }),
    "resume",
    `${language} localized continuation must reach governed resume normalization`,
  );
}

const terminalStatuses = ["completed", "cancelled", "superseded"];
for (const status of terminalStatuses) {
  const run = normalizeOperatorAutonomousRun({
    run_id: `terminal_${status}`,
    run_kind: "single_action",
    pending_binding: "run_id_v1",
    objective: "Historical action that must never be revived",
    status,
    planned_steps: [
      {
        id: "requested_action",
        kind: "action",
        description: "Historical action",
        capability_key: "platform.historical_action.write",
        status:
          status === "completed"
            ? "completed"
            : status === "cancelled"
              ? "cancelled"
              : "superseded",
        payload: { historical: true, status },
        gate: "confirmation",
      },
    ],
    completed_steps: status === "completed" ? ["requested_action"] : [],
    current_step_id: "requested_action",
    created_at: "2026-08-24T00:00:00.000Z",
  });

  assert.equal(run.status, status, `${status} run must remain terminal`);
  assert.equal(
    run.current_step_id,
    null,
    `${status} run must expose no resumable current step`,
  );
  assert.equal(
    operatorAutonomousRunRequiresPendingExecutionBinding(run),
    false,
    `${status} run must not require or authorize a live pending binding`,
  );

  const stalePending = {
    capability_key: "platform.historical_action.write",
    run_id: run.run_id,
    payload: { historical: true, status },
    reason: "Historical pending projection",
  };
  assert.equal(
    operatorPendingExecutionMatchesAutonomousRun(stalePending, run),
    false,
    `${status} run must reject even structurally matching stale pending execution`,
  );

  const attemptedRevival = transitionOperatorAutonomousRun(run, {
    status: "active",
    currentStepId: "requested_action",
    stepId: "requested_action",
    stepStatus: "running",
    blocker: null,
  });
  assert.equal(
    attemptedRevival.run_id,
    run.run_id,
    `${status} run identity must remain historical`,
  );
  assert.equal(
    attemptedRevival.status,
    status,
    `${status} run must ignore attempted revival transition`,
  );
  assert.equal(
    attemptedRevival.current_step_id,
    null,
    `${status} run must remain non-resumable after attempted transition`,
  );
}

const projectGuardSource = coreSource.slice(
  continuationDecisionStart,
  activeAgreementStart + 600,
);
assert.ok(
  projectGuardSource.includes("!continueProjectAfterTerminalRun"),
  "active project continuation after a terminal run must not enter run-resume handling",
);
assert.ok(
  projectGuardSource.includes(
    "clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending))",
  ),
  "terminal project continuation must clear any stale pending projection before normal project reasoning",
);

console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_AUDIT=PASS");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_RUNTIME=LEGACY_BEHIND_GOVERNED_ROUTER");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_STATUSES=COMPLETED_CANCELLED_SUPERSEDED");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_SCOPE=ACTIVE_PROJECT_NOT_OLD_RUN");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_PENDING=STALE_PROJECTION_NOT_RESUMABLE");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_OLD_RUN=IMMUTABLE_HISTORY");
console.log("OPERATOR_TERMINAL_RUN_PROJECT_CONTINUATION_NEW_ACTION=REQUIRES_NEW_GOVERNED_SELECTION");
