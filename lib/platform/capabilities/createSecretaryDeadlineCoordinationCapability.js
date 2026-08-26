import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryDeadlineCoordination,
  listSecretaryDeadlines,
  readSecretaryDeadline,
  recordSecretaryDeadlineCompletionEvidence,
  recordSecretaryDeadlineInput,
  refreshSecretaryDeadline,
  registerSecretaryDeadline,
  reviseSecretaryDeadline,
} from "@/lib/operator/secretary/SecretaryDeadlineCoordinationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  register: { mode: "write", risk: "low", aliases: ["track this deadline", "remember this filing deadline", "monitor this renewal date"], description: "Register an explicitly evidenced administrative deadline and materialize governed reminders, input requests, chases, and executive review without inventing legal or statutory conclusions.", execute: registerSecretaryDeadline },
  read: { mode: "read", risk: "low", aliases: ["show this deadline", "what is the status of this deadline"], description: "Read one evidence-backed Secretary deadline record, missing inputs, revisions, completion evidence, and follow-up state without inferring compliance.", execute: readSecretaryDeadline },
  list: { mode: "read", risk: "low", aliases: ["show deadlines", "what deadlines are coming up", "show overdue deadlines"], description: "List organization-scoped tracked deadlines and temporal status without treating a passed date as legal non-compliance.", execute: listSecretaryDeadlines },
  recordInput: { mode: "write", risk: "low", aliases: ["record this deadline input", "mark this deadline document received", "record this input unavailable"], description: "Record explicit evidence for a required deadline input and fence stale request/chase/escalation work without judging sufficiency.", execute: recordSecretaryDeadlineInput },
  revise: { mode: "write", risk: "low", aliases: ["change this deadline from evidence", "record the revised due date"], description: "Revise a tracked due date only from explicit evidence, preserve the previous date and revision history, and fence the superseded reminder schedule.", execute: reviseSecretaryDeadline },
  recordCompletion: { mode: "write", risk: "low", aliases: ["record deadline completion evidence", "mark this deadline evidence received"], description: "Record explicit completion evidence and close Secretary follow-through without claiming the underlying filing, legal requirement, statutory obligation, or compliance state is valid or satisfied.", execute: recordSecretaryDeadlineCompletionEvidence },
  refresh: { mode: "write", risk: "low", aliases: ["refresh deadline follow up", "check deadline reminders"], description: "Refresh deterministic Secretary deadline reminders and temporal overdue review. Overdue is time-based only and is never a legal conclusion.", execute: refreshSecretaryDeadline },
  cancel: { mode: "write", risk: "low", aliases: ["stop tracking this deadline", "cancel deadline coordination"], description: "Cancel Secretary administrative follow-through while preserving evidence and without cancelling, waiving, or satisfying the external obligation.", execute: cancelSecretaryDeadlineCoordination },
});

function locator() {
  return { deadline_id: { type: "string" }, deadline_key: { type: "string" }, deadline_reference: { type: "string" } };
}

function schema(action) {
  if (action === "register") return {
    type: "object",
    properties: {
      deadline_key: { type: "string" }, title: { type: "string" }, deadline_type: { type: "string" }, jurisdiction: { type: "string" }, authority_label: { type: "string" },
      due_at: { type: "string" }, evidence_id: { type: "string" }, source_reference: { type: "string" }, responsible_party_id: { type: "string" }, priority: { type: "string" },
      reminder_offsets_days: { type: "array", maxItems: 20, items: { type: "number" } },
      required_inputs: { type: "array", maxItems: 100, items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, responsible_party_id: { type: "string" }, notes: { type: "string" } }, required: ["label"], additionalProperties: false } },
      entity_id: { type: "string" },
    },
    required: ["deadline_key", "due_at", "evidence_id", "source_reference"], additionalProperties: false,
  };
  if (action === "read" || action === "cancel") return { type: "object", properties: { ...locator(), reason: { type: "string" } }, additionalProperties: false };
  if (action === "list") return { type: "object", properties: { query: { type: "string" }, deadline_type: { type: "string" }, deadline_status: { type: "string" }, include_cancelled: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
  if (action === "recordInput") return { type: "object", properties: { ...locator(), input_id: { type: "string" }, input_status: { type: "string" }, evidence_id: { type: "string" }, source_reference: { type: "string" }, reason: { type: "string" } }, required: ["deadline_id", "input_id", "evidence_id"], additionalProperties: false };
  if (action === "revise") return { type: "object", properties: { ...locator(), new_due_at: { type: "string" }, evidence_id: { type: "string" }, source_reference: { type: "string" }, reason: { type: "string" } }, required: ["deadline_id", "new_due_at", "evidence_id", "source_reference", "reason"], additionalProperties: false };
  if (action === "recordCompletion") return { type: "object", properties: { ...locator(), evidence_id: { type: "string" }, source_reference: { type: "string" }, description: { type: "string" } }, required: ["deadline_id", "evidence_id", "source_reference"], additionalProperties: false };
  return { type: "object", properties: { ...locator(), now: { type: "string" } }, required: ["deadline_id"], additionalProperties: false };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryDeadlineCoordinationCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DEADLINE_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_deadline_coordination", action,
    name: `Executive Secretary deadline coordination ${action}`,
    document: "secretary_deadline_coordination", description: config.description,
    permissions: [], events: [`platform.secretary_deadline_coordination.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "deadline", "reminder", "follow-up", "evidence", config.mode],
    operatorAliases: config.aliases, operatorExamples: config.aliases,
    transactional: config.mode !== "read", aiEnabled: true, operatorEnabled: true,
    operatorMode: config.mode, operatorAutoExecute: true, operatorRequiresConfirmation: false,
    contextScope: "organization", risk: config.risk, reversible: true, approval: { required: false }, inputSchema: schema(action),
  });
  function authorize({ context }) { return Boolean(text(context?.organizationId, 120) && actorPartyId(context)); }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryDeadlineCoordinationCapability;
