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

const { classifyPendingOperatorReply } = await import(
  "@/lib/operator/runtime/OperatorHumanDecisionClassifier"
);
const {
  createOperatorAutonomousRun,
  createOperatorMissionRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");
const { runOperatorTurn } = await import(
  "@/lib/operator/runtime/OperatorTurnRuntimeCore"
);

const localized = [
  { language: "sv", yes: "ja", no: "nej" },
  { language: "de", yes: "ja", no: "nein" },
  { language: "fr", yes: "oui", no: "non" },
  { language: "es", yes: "sí", no: "no" },
  { language: "th", yes: "ใช่", no: "ไม่" },
];

for (const item of localized) {
  assert.equal(
    classifyPendingOperatorReply({
      message: item.yes,
      pending: true,
      recommendation: false,
    }),
    "execute",
    `${item.language} yes must confirm an exact ordinary pending action`,
  );
  assert.equal(
    classifyPendingOperatorReply({
      message: item.no,
      pending: true,
      recommendation: false,
    }),
    "reject",
    `${item.language} no must reject an exact ordinary pending action`,
  );
  assert.equal(
    classifyPendingOperatorReply({
      message: item.yes,
      pending: true,
      recommendation: true,
    }),
    "agree",
    `${item.language} recommendation yes must select direction without executing`,
  );
  assert.equal(
    classifyPendingOperatorReply({
      message: item.no,
      pending: true,
      recommendation: true,
    }),
    "reject",
    `${item.language} recommendation no must reject the recommendation`,
  );
  assert.equal(
    classifyPendingOperatorReply({
      message: item.yes,
      pending: false,
      recommendation: false,
    }),
    null,
    `${item.language} yes without a pending referent must not become generic execution authority`,
  );
  assert.equal(
    classifyPendingOperatorReply({
      message: item.no,
      pending: false,
      recommendation: false,
    }),
    null,
    `${item.language} no without a pending referent must not become generic cancellation authority`,
  );
}

const genericRun = createOperatorAutonomousRun({
  objective: "Complete the localized confirmation referential audit action",
  pendingExecution: {
    capability_key: "platform.localized_confirmation.write",
    description: "Perform localized confirmation audit action",
    payload: { id: "localized_confirmation_audit" },
  },
});

const missionRun = createOperatorMissionRun({
  objective: "Complete the localized confirmation referential audit mission",
  missionState: {
    run_id: "operator_run_localized_confirmation_mission_audit",
    status: "awaiting_confirmation",
    current_step_id: "write_step",
    completed_step_ids: ["read_step"],
    steps: [
      {
        id: "read_step",
        kind: "read",
        description: "Read localized confirmation evidence",
        capability_key: "platform.localized_confirmation.read",
        status: "completed",
        payload: { id: "localized_confirmation_audit" },
        gate: "none",
      },
      {
        id: "write_step",
        kind: "action",
        description: "Perform localized confirmation mission action",
        capability_key: "platform.localized_confirmation.write",
        status: "planned",
        payload: { id: "localized_confirmation_audit" },
        gate: "confirmation",
      },
    ],
  },
});

async function orphanedTurn({ run, message, source, malformedPending = false }) {
  const agreementState = {
    autonomous_run: run,
    marker: "preserve",
    ...(malformedPending
      ? {
          pending_execution: {
            capability_key: "",
            payload: { stale: true },
          },
        }
      : {}),
  };

  return runOperatorTurn({
    organizationId: "org_operator_localized_confirmation_audit",
    partyId: "party_operator_localized_confirmation_audit",
    actor: { id: "actor_operator_localized_confirmation_audit" },
    role: "OWNER",
    permissions: [],
    locale: "en",
    timezone: "UTC",
    message,
    source,
    agreementState,
    projectState: {},
    conversation: [],
  });
}

for (const item of localized) {
  for (const source of ["text", "voice"]) {
    for (const [decision, phrase] of [["yes", item.yes], ["no", item.no]]) {
      for (const [kind, run] of [["generic", genericRun], ["mission", missionRun]]) {
        const missing = await orphanedTurn({ run, message: phrase, source });
        assert.equal(missing.success, true);
        assert.equal(
          missing.execution,
          null,
          `${item.language}/${source}/${decision}/${kind} orphaned reply must not execute`,
        );
        assert.equal(
          missing.operator_catalog?.bypassed_for_orphaned_pending_decision,
          true,
          `${item.language}/${source}/${decision}/${kind} must use orphaned decision guard`,
        );
        assert.equal(
          missing.operator_catalog?.execution_authorized,
          false,
        );
        assert.equal(
          missing.agreement_state?.autonomous_run?.run_id,
          run.run_id,
          `${item.language}/${source}/${decision}/${kind} must preserve run identity`,
        );
        assert.notEqual(
          missing.agreement_state?.autonomous_run?.status,
          "superseded",
          `${item.language}/${source}/${decision}/${kind} shorthand must not supersede orphaned run`,
        );
        assert.equal(missing.decision?.clarification?.required, true);

        const malformed = await orphanedTurn({
          run,
          message: phrase,
          source,
          malformedPending: true,
        });
        assert.equal(malformed.execution, null);
        assert.equal(
          malformed.operator_catalog?.bypassed_for_orphaned_pending_decision,
          true,
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(
            malformed.agreement_state || {},
            "pending_execution",
          ),
          false,
          `${item.language}/${source}/${decision}/${kind} must clear malformed pending projection only`,
        );
        assert.equal(
          malformed.agreement_state?.autonomous_run?.run_id,
          run.run_id,
        );
      }
    }
  }
}

console.log("OPERATOR_LOCALIZED_CONFIRMATION_RUNTIME_AUDIT=PASS");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_VALID=EXACT_PENDING_ONLY");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_RECOMMENDATION=AGREEMENT_NOT_EXECUTION");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_ORPHANED=FAIL_CLOSED_RUN_PRESERVED");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_MALFORMED=STALE_PENDING_CLEARED");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_CHANNEL=TEXT_VOICE_PARITY");
console.log("OPERATOR_LOCALIZED_CONFIRMATION_EXECUTION=NO_ORPHANED_AUTHORITY");
