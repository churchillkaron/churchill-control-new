import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const inertImportEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "operator-runtime-audit-placeholder",
};
for (const [name, value] of Object.entries(inertImportEnvironment)) {
  if (!process.env[name]) process.env[name] = value;
}

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";

const { classifyPendingOperatorReply } = await import(
  "@/lib/operator/runtime/OperatorHumanDecisionClassifier"
);
const { createOperatorMissionRun } = await import(
  "@/lib/operator/contracts/OperatorAutonomousRun"
);
const { runOperatorTurn } = await import(
  "@/lib/operator/runtime/OperatorTurnRuntimeCore"
);

function missionStepProjection(step) {
  return {
    id: step.id,
    description: step.description,
    capability_key: step.capability_key,
    payload: step.payload || {},
    ...(step.verify_after
      ? {
          verify_after: {
            capability_key: step.verify_after.capability_key,
            description: step.verify_after.description,
            payload: step.verify_after.payload || {},
          },
        }
      : {}),
  };
}

function exactMissionPending(run) {
  return {
    capability_key: OPERATOR_MISSION_KEY,
    payload: {
      steps: run.planned_steps.map(missionStepProjection),
      resume: {
        current_step_id: run.current_step_id,
        completed_step_ids: [...run.completed_steps],
        current_step_confirmed: false,
        approval_request_id: null,
        verification_pending: null,
      },
    },
    reason: "Resume exact localized audit mission",
    original_message: "Complete the localized resume audit mission",
    resume_kind: "mission",
  };
}

function agreementState(run, pendingExecution) {
  const next = { autonomous_run: run, marker: "preserve" };
  if (arguments.length > 1) next.pending_execution = pendingExecution;
  return next;
}

async function governedResume(message, run, pendingExecution, hasPending) {
  const replyClass = classifyPendingOperatorReply({
    message,
    pending: hasPending,
    recommendation: false,
  });
  assert.equal(replyClass, "resume", `${message} must classify as exact resume`);
  const state = hasPending
    ? agreementState(run, pendingExecution)
    : agreementState(run);
  return runOperatorTurn({
    organizationId: "org_operator_localized_resume_audit",
    partyId: "party_operator_localized_resume_audit",
    actor: { id: "actor_operator_localized_resume_audit" },
    role: "OWNER",
    permissions: [],
    locale: "en",
    timezone: "UTC",
    message: "continue",
    source: "text",
    agreementState: state,
    projectState: {},
    conversation: [],
  });
}

const run = createOperatorMissionRun({
  objective: "Complete the localized resume audit mission",
  missionState: {
    run_id: "operator_run_localized_resume_runtime_audit",
    status: "awaiting_confirmation",
    current_step_id: "write_step",
    completed_step_ids: ["read_step"],
    steps: [
      {
        id: "read_step",
        kind: "read",
        description: "Read exact localized audit evidence",
        capability_key: "platform.localized_resume.read",
        status: "completed",
        payload: { id: "localized_resume_audit" },
        gate: "none",
      },
      {
        id: "write_step",
        kind: "action",
        description: "Perform exact localized audit action",
        capability_key: "platform.localized_resume.write",
        status: "planned",
        payload: { id: "localized_resume_audit" },
        gate: "confirmation",
      },
    ],
  },
});
const pending = exactMissionPending(run);

const localizedResumePhrases = [
  ["sv", "fortsätt"],
  ["de", "mach weiter"],
  ["fr", "reprends"],
  ["es", "continúa"],
  ["th", "ทำต่อ"],
];

for (const [language, phrase] of localizedResumePhrases) {
  const exact = await governedResume(phrase, run, pending, true);
  assert.equal(exact.success, true, `${language} exact resume must succeed`);
  assert.equal(exact.execution, null, `${language} exact resume must not execute`);
  assert.equal(exact.decision?.clarification?.required, true);
  assert.match(exact.decision?.response_text || "", /explicit confirmation/i);
  assert.equal(exact.agreement_state?.autonomous_run?.run_id, run.run_id);
  assert.deepEqual(exact.agreement_state?.pending_execution, pending);

  const orphaned = await governedResume(phrase, run, pending, false);
  assert.equal(orphaned.success, true, `${language} orphaned resume must return safely`);
  assert.equal(orphaned.execution, null, `${language} orphaned resume must not execute`);
  assert.equal(orphaned.operator_catalog?.orphaned_mission_run, true);
  assert.equal(orphaned.operator_catalog?.execution_authorized, false);
  assert.match(
    orphaned.decision?.response_text || "",
    /will not reconstruct, guess, or replay the old mission/i,
  );
  assert.equal(orphaned.agreement_state?.autonomous_run?.run_id, run.run_id);
}

const nonControlPhrases = [
  "fortsätt med en ny analys",
  "mach weiter mit einer neuen analyse",
  "reprends avec une nouvelle analyse",
  "continúa con un análisis nuevo",
  "ทำต่อด้วยการวิเคราะห์ใหม่",
];
for (const phrase of nonControlPhrases) {
  assert.equal(
    classifyPendingOperatorReply({
      message: phrase,
      pending: false,
      recommendation: false,
    }),
    null,
    `${phrase} must not become orphaned-run resume authority`,
  );
}

console.log("OPERATOR_LOCALIZED_RESUME_RUNTIME_AUDIT=PASS");
console.log("OPERATOR_LOCALIZED_RESUME_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_LOCALIZED_RESUME_EXACT=GOVERNED_CONFIRMATION_PATH");
console.log("OPERATOR_LOCALIZED_RESUME_ORPHANED=FAIL_CLOSED_NO_REPLAY");
console.log("OPERATOR_LOCALIZED_RESUME_NEW_REQUEST=NOT_RECLASSIFIED");
console.log("OPERATOR_LOCALIZED_RESUME_EXECUTION=DISABLED");
