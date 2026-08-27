import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryOfficeAdministration,
  completeSecretaryOfficeAdministration,
  listSecretaryOfficeAdministration,
  readSecretaryOfficeAdministration,
  recordSecretaryOfficeAdministrationCommitment,
  recordSecretaryOfficeAdministrationQuote,
  recordSecretaryOfficeAdministrationUpdate,
  startSecretaryOfficeAdministration,
} from "@/lib/operator/secretary/SecretaryOfficeAdministrationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    aliases: ["log office issue", "track office supplies", "coordinate room setup", "track equipment issue", "coordinate office service"],
    description: "Register an evidence-backed office administration request covering supplies, facilities, equipment, room setup, or service coordination. This creates no purchasing, signing, approval, payment, or vendor authority.",
    execute: startSecretaryOfficeAdministration,
  },
  update: {
    mode: "write",
    aliases: ["update office request", "record facilities update", "record office service status"],
    description: "Record an evidence-backed office administration progress/status update and optionally schedule bounded follow-through. Completion is not inferred.",
    execute: recordSecretaryOfficeAdministrationUpdate,
  },
  quote: {
    mode: "write",
    aliases: ["record office quote", "log vendor quote", "record supply quote"],
    description: "Record an informational vendor quote for executive review. Recording the quote never accepts it, places an order, authorizes service, or creates payment authority.",
    execute: recordSecretaryOfficeAdministrationQuote,
  },
  commitment: {
    mode: "write",
    aliases: ["record authorized office order", "record authorized service", "log external office commitment"],
    description: "Record evidence of an office administration commitment already authorized or placed by another explicit party. Avantiqo does not create or extend that authority.",
    execute: recordSecretaryOfficeAdministrationCommitment,
  },
  complete: {
    mode: "write",
    aliases: ["complete office request", "record facilities issue completed", "record room setup done"],
    description: "Record explicit completion evidence for an office administration request. This does not infer repair quality, goods receipt, invoice approval, or payment.",
    execute: completeSecretaryOfficeAdministration,
  },
  cancel: {
    mode: "write",
    aliases: ["cancel office coordination", "stop tracking office issue", "cancel facilities admin"],
    description: "Cancel only Avantiqo's administrative coordination record. This does not cancel any external order, service, contract, appointment, or payment.",
    execute: cancelSecretaryOfficeAdministration,
  },
  read: {
    mode: "read",
    aliases: ["show office request", "read facilities request", "show office admin item"],
    description: "Read one office administration request with its evidence history, recorded quotes, external commitment evidence, and current coordination state.",
    execute: readSecretaryOfficeAdministration,
  },
  list: {
    mode: "read",
    aliases: ["show office requests", "show facilities issues", "show office supplies requests", "list office admin"],
    description: "List active office administration requests for the executive by default, optionally including terminal requests.",
    execute: listSecretaryOfficeAdministration,
  },
});

function commonProperties() {
  return {
    request_id: { type: "string" },
    evidence_id: { type: "string" },
    occurred_at: { type: "string" },
  };
}

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      category: { type: "string", enum: ["OFFICE_SUPPLIES", "FACILITY_ISSUE", "EQUIPMENT_ISSUE", "ROOM_SETUP", "SERVICE_COORDINATION", "OTHER"] },
      title: { type: "string" },
      description: { type: "string" },
      evidence_id: { type: "string" },
      started_at: { type: "string" },
      target_party_id: { type: "string" },
      desired_by: { type: "string" },
      next_follow_up_at: { type: "string" },
      entity_id: { type: "string" },
      priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    },
    required: ["category", "title", "description", "evidence_id", "started_at"],
    additionalProperties: false,
  };
  if (action === "update") return {
    type: "object",
    properties: {
      ...commonProperties(),
      update: { type: "string" },
      state: { type: "string", enum: ["OPEN", "IN_PROGRESS", "WAITING_EXTERNAL", "WAITING_APPROVAL"] },
      target_party_id: { type: "string" },
      next_follow_up_at: { type: "string" },
    },
    required: ["request_id", "evidence_id", "occurred_at", "update"],
    additionalProperties: false,
  };
  if (action === "quote") return {
    type: "object",
    properties: {
      ...commonProperties(),
      quoted_at: { type: "string" },
      vendor_party_id: { type: "string" },
      quote_reference: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      approval_review_at: { type: "string" },
    },
    required: ["request_id", "evidence_id", "quoted_at", "vendor_party_id", "quote_reference"],
    additionalProperties: false,
  };
  if (action === "commitment") return {
    type: "object",
    properties: {
      ...commonProperties(),
      confirmed_at: { type: "string" },
      authorized_by_party_id: { type: "string" },
      reference: { type: "string" },
      target_party_id: { type: "string" },
      next_follow_up_at: { type: "string" },
    },
    required: ["request_id", "evidence_id", "confirmed_at", "authorized_by_party_id", "reference"],
    additionalProperties: false,
  };
  if (action === "complete") return {
    type: "object",
    properties: { ...commonProperties(), completed_at: { type: "string" }, completion_summary: { type: "string" } },
    required: ["request_id", "evidence_id", "completed_at", "completion_summary"],
    additionalProperties: false,
  };
  if (action === "cancel") return {
    type: "object",
    properties: { ...commonProperties(), cancelled_at: { type: "string" }, reason: { type: "string" } },
    required: ["request_id", "evidence_id", "cancelled_at"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { request_id: { type: "string" } },
    required: ["request_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: ["OFFICE_SUPPLIES", "FACILITY_ISSUE", "EQUIPMENT_ISSUE", "ROOM_SETUP", "SERVICE_COORDINATION", "OTHER"] },
      include_terminal: { type: "boolean" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryOfficeAdministrationCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_OFFICE_ADMIN_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_office_administration",
    action,
    name: `Executive Secretary office administration ${action}`,
    document: "secretary_office_administration",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_office_administration.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "office", "facilities", "supplies", "administration", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode === "write",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.mode === "write" ? "medium" : "low",
    reversible: true,
    approval: { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryOfficeAdministrationCapability;
