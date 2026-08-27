import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryMailCourierCoordination,
  listSecretaryMailCourierCoordination,
  readSecretaryMailCourierCoordination,
  recordSecretaryMailCourierDelivery,
  recordSecretaryMailCourierDispatch,
  recordSecretaryMailCourierException,
  recordSecretaryMailCourierHandoff,
  recordSecretaryMailCourierReceipt,
  recordSecretaryMailCourierRoute,
  startSecretaryMailCourierCoordination,
} from "@/lib/operator/secretary/SecretaryMailCourierCoordinationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    aliases: ["log this mail", "register this parcel", "log this courier item", "record this package"],
    description: "Register an inbound or outbound physical mail/courier item for evidence-backed administrative coordination. This does not buy postage, book a carrier, accept legal terms, or submit customs declarations.",
    execute: startSecretaryMailCourierCoordination,
  },
  receipt: {
    mode: "write",
    aliases: ["record this parcel received", "mark this mail received", "log courier receipt"],
    description: "Record explicit evidence that an inbound physical item was received into administrative custody. Receipt is never inferred.",
    execute: recordSecretaryMailCourierReceipt,
  },
  route: {
    mode: "write",
    aliases: ["route this parcel", "send this mail to the recipient", "route this package internally"],
    description: "Route a received inbound item to an explicitly identified internal recipient and optionally schedule a handoff review. Recipient identity and collection are never inferred.",
    execute: recordSecretaryMailCourierRoute,
  },
  handoff: {
    mode: "write",
    aliases: ["record parcel collected", "record mail handoff", "mark package handed over"],
    description: "Record explicit evidence that a routed inbound item was physically handed to the exact routed recipient. Collection is never inferred from a notification or elapsed time.",
    execute: recordSecretaryMailCourierHandoff,
  },
  dispatch: {
    mode: "write",
    aliases: ["record parcel dispatched", "mark this courier sent", "record outgoing mail dispatch"],
    description: "Record explicit dispatch evidence for an outbound item. This action does not purchase postage or book a carrier.",
    execute: recordSecretaryMailCourierDispatch,
  },
  delivery: {
    mode: "write",
    aliases: ["record parcel delivered", "record courier delivery", "mark outgoing mail delivered"],
    description: "Record explicit evidence that a dispatched outbound item was delivered. Delivery is never inferred from tracking text alone.",
    execute: recordSecretaryMailCourierDelivery,
  },
  exception: {
    mode: "write",
    aliases: ["log courier problem", "record parcel exception", "record mail issue"],
    description: "Record an evidence-backed mail/courier exception and optionally schedule a review. This does not make legal, carrier, customs, or financial decisions.",
    execute: recordSecretaryMailCourierException,
  },
  cancel: {
    mode: "write",
    aliases: ["cancel mail coordination", "stop tracking this parcel internally", "cancel courier admin"],
    description: "Cancel Avantiqo's administrative coordination record only. This never claims that an external carrier shipment was cancelled.",
    execute: cancelSecretaryMailCourierCoordination,
  },
  read: {
    mode: "read",
    aliases: ["show this parcel", "show this mail item", "read courier record"],
    description: "Read one evidence-backed physical mail/courier coordination record and its custody/dispatch history.",
    execute: readSecretaryMailCourierCoordination,
  },
  list: {
    mode: "read",
    aliases: ["show parcels", "show mailroom items", "list courier items", "show uncollected packages"],
    description: "List the executive Secretary's physical mail/courier coordination records, with terminal records excluded by default.",
    execute: listSecretaryMailCourierCoordination,
  },
});

function baseProperties() {
  return {
    coordination_id: { type: "string" },
    evidence_id: { type: "string" },
    occurred_at: { type: "string" },
  };
}

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] },
      item_kind: { type: "string", enum: ["LETTER", "DOCUMENT", "PARCEL", "CARD", "PACKAGE", "OTHER"] },
      item_description: { type: "string" },
      evidence_id: { type: "string" },
      registered_at: { type: "string" },
      sender_party_id: { type: "string" },
      recipient_party_id: { type: "string" },
      external_reference: { type: "string" },
      carrier_name: { type: "string" },
      tracking_reference: { type: "string" },
      next_check_at: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["direction", "item_description", "evidence_id", "registered_at"],
    additionalProperties: false,
  };
  if (action === "receipt") return {
    type: "object",
    properties: { ...baseProperties(), received_at: { type: "string" }, custody_holder_party_id: { type: "string" } },
    required: ["coordination_id", "evidence_id", "received_at"],
    additionalProperties: false,
  };
  if (action === "route") return {
    type: "object",
    properties: { ...baseProperties(), routed_at: { type: "string" }, recipient_party_id: { type: "string" }, handoff_due_at: { type: "string" } },
    required: ["coordination_id", "evidence_id", "routed_at", "recipient_party_id"],
    additionalProperties: false,
  };
  if (action === "handoff") return {
    type: "object",
    properties: { ...baseProperties(), handed_off_at: { type: "string" }, recipient_party_id: { type: "string" } },
    required: ["coordination_id", "evidence_id", "handed_off_at", "recipient_party_id"],
    additionalProperties: false,
  };
  if (action === "dispatch") return {
    type: "object",
    properties: { ...baseProperties(), dispatched_at: { type: "string" }, carrier_name: { type: "string" }, tracking_reference: { type: "string" }, delivery_check_at: { type: "string" } },
    required: ["coordination_id", "evidence_id", "dispatched_at"],
    additionalProperties: false,
  };
  if (action === "delivery") return {
    type: "object",
    properties: { ...baseProperties(), delivered_at: { type: "string" } },
    required: ["coordination_id", "evidence_id", "delivered_at"],
    additionalProperties: false,
  };
  if (action === "exception") return {
    type: "object",
    properties: { ...baseProperties(), recorded_at: { type: "string" }, summary: { type: "string" }, next_check_at: { type: "string" } },
    required: ["coordination_id", "evidence_id", "recorded_at", "summary"],
    additionalProperties: false,
  };
  if (action === "cancel") return {
    type: "object",
    properties: { ...baseProperties(), cancelled_at: { type: "string" }, reason: { type: "string" } },
    required: ["coordination_id", "evidence_id", "cancelled_at"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { coordination_id: { type: "string" } },
    required: ["coordination_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] }, include_terminal: { type: "boolean" }, limit: { type: "number" } },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryMailCourierCoordinationCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_MAIL_COURIER_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_mail_courier",
    action,
    name: `Executive Secretary mail and courier ${action}`,
    document: "secretary_mail_courier",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_mail_courier.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "mail", "courier", "parcel", "custody", config.mode],
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

export default createSecretaryMailCourierCoordinationCapability;
