import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryStaffDelegation,
  completeSecretaryStaffDelegation,
  delegateSecretaryStaffWork,
  listSecretaryStaffDelegations,
  readSecretaryStaffDelegation,
  reassignSecretaryStaffWork,
  recordSecretaryStaffDelegationProgress,
  recordSecretaryStaffDelegationResponse,
  refreshSecretaryStaffDelegation,
} from "@/lib/operator/secretary/SecretaryStaffDelegationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  delegate: {
    mode: "write",
    risk: "medium",
    aliases: ["assign this work to staff", "delegate this task", "give this job to someone", "assign this to them"],
    description: "Create a durable staff work assignment with explicit acceptance/rejection evidence, Secretary follow-through, and no inferred employment, authority, acceptance, or completion.",
  },
  read: {
    mode: "read",
    risk: "low",
    aliases: ["show delegated work", "show this staff assignment", "what is the status of this assignment"],
    description: "Read one durable staff delegation, its evidence-backed assignment state, progress history, and Secretary-owned follow-ups.",
  },
  list: {
    mode: "read",
    risk: "low",
    aliases: ["show all delegated work", "staff work status", "what work have I delegated", "show staff assignments"],
    description: "List durable staff delegations without inferring performance, urgency, misconduct, completion, or employment relationship.",
  },
  recordResponse: {
    mode: "write",
    risk: "low",
    aliases: ["record that they accepted the task", "record that they rejected the task", "mark assignment accepted", "mark assignment rejected"],
    description: "Record explicit assignment acceptance or rejection only when evidence is supplied. Silence, delivery, read status, and other activity never become acceptance.",
  },
  recordProgress: {
    mode: "write",
    risk: "low",
    aliases: ["record their progress", "update delegated work progress", "they sent a progress update"],
    description: "Record an evidence-backed staff progress update and schedule the next factual check without inferring performance or completion.",
  },
  reassign: {
    mode: "write",
    risk: "medium",
    aliases: ["reassign this work", "give this task to someone else", "change the assignee"],
    description: "Administratively reassign routine work, fence stale follow-ups, preserve executive ownership, and require fresh acceptance evidence from the new assignee.",
  },
  complete: {
    mode: "write",
    risk: "low",
    aliases: ["mark delegated work complete", "record completion of this assignment", "they finished the task"],
    description: "Close delegated work only when explicit completion evidence is supplied. Completion is never inferred from silence, progress, due dates, or message delivery.",
  },
  refresh: {
    mode: "write",
    risk: "low",
    aliases: ["chase delegated work", "refresh staff work status", "check overdue delegated work", "follow up on this assignment"],
    description: "Refresh one assignment, create deterministic acceptance/progress follow-ups when due, and flag temporal overdue status without inferring urgency, misconduct, poor performance, or legal breach.",
  },
  cancel: {
    mode: "write",
    risk: "medium",
    aliases: ["cancel this staff assignment", "stop this delegated work"],
    description: "Cancel the Secretary-managed delegation lifecycle and fence its pending follow-ups without mutating platform permissions or granting authority.",
  },
});

function schema(action) {
  const taskId = { task_id: { type: "string" } };
  if (action === "delegate") {
    return {
      type: "object",
      properties: {
        title: { type: "string" },
        details: { type: "string" },
        assignee_party_id: { type: "string" },
        due_at: { type: "string" },
        acceptance_due_at: { type: "string" },
        progress_check_at: { type: "string" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
        idempotency_key: { type: "string" },
        source_reference: { type: "string" },
        evidence_id: { type: "string" },
      },
      required: ["title", "assignee_party_id"],
      additionalProperties: false,
    };
  }
  if (action === "read") return { type: "object", properties: taskId, required: ["task_id"], additionalProperties: false };
  if (action === "list") {
    return {
      type: "object",
      properties: {
        assignee_party_id: { type: "string" },
        include_completed: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 300 },
      },
      additionalProperties: false,
    };
  }
  if (action === "recordResponse") {
    return {
      type: "object",
      properties: {
        ...taskId,
        response: { type: "string", enum: ["ACCEPTED", "REJECTED"] },
        evidence_id: { type: "string" },
      },
      required: ["task_id", "response", "evidence_id"],
      additionalProperties: false,
    };
  }
  if (action === "recordProgress") {
    return {
      type: "object",
      properties: {
        ...taskId,
        evidence_id: { type: "string" },
        progress_note: { type: "string" },
        blocked: { type: "boolean" },
        blocker_text: { type: "string" },
      },
      required: ["task_id", "evidence_id", "progress_note"],
      additionalProperties: false,
    };
  }
  if (action === "reassign") {
    return {
      type: "object",
      properties: {
        ...taskId,
        assignee_party_id: { type: "string" },
        acceptance_due_at: { type: "string" },
        progress_check_at: { type: "string" },
        evidence_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["task_id", "assignee_party_id"],
      additionalProperties: false,
    };
  }
  if (action === "complete") {
    return {
      type: "object",
      properties: {
        ...taskId,
        evidence_id: { type: "string" },
        completion_note: { type: "string" },
      },
      required: ["task_id", "evidence_id"],
      additionalProperties: false,
    };
  }
  if (action === "refresh") {
    return {
      type: "object",
      properties: { ...taskId, now: { type: "string" } },
      required: ["task_id"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: { ...taskId, reason: { type: "string" } },
    required: ["task_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryStaffDelegationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_STAFF_DELEGATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_staff_delegation",
    action,
    name: `Executive Secretary staff delegation ${action}`,
    document: "secretary_staff_delegation",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_staff_delegation.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "staff", "delegation", "follow-through", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.risk,
    reversible: action !== "complete",
    approval: { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    if (action === "delegate") return delegateSecretaryStaffWork({ context, payload });
    if (action === "read") return readSecretaryStaffDelegation({ context, payload });
    if (action === "list") return listSecretaryStaffDelegations({ context, payload });
    if (action === "recordResponse") return recordSecretaryStaffDelegationResponse({ context, payload });
    if (action === "recordProgress") return recordSecretaryStaffDelegationProgress({ context, payload });
    if (action === "reassign") return reassignSecretaryStaffWork({ context, payload });
    if (action === "complete") return completeSecretaryStaffDelegation({ context, payload });
    if (action === "refresh") return refreshSecretaryStaffDelegation({ context, payload });
    if (action === "cancel") return cancelSecretaryStaffDelegation({ context, payload });
    throw new Error(`SECRETARY_STAFF_DELEGATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryStaffDelegationCapability;
