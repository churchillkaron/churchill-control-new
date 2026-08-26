import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryVisitorCoordination,
  readSecretaryVisitorCoordination,
  recordSecretaryVisitorAccessDecision,
  recordSecretaryVisitorArrivalEvidence,
  recordSecretaryVisitorArrivalInstructionAcknowledgement,
  recordSecretaryVisitorHostResponse,
  recordSecretaryVisitorResponse,
  refreshSecretaryVisitorCoordination,
  startSecretaryVisitorCoordination,
} from "@/lib/operator/secretary/SecretaryVisitorCoordinationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write", risk: "medium", reversible: true,
    aliases: ["coordinate this visitor", "prepare for this guest", "arrange this office visit", "coordinate visitor arrival"],
    description: "Start durable visitor coordination for an existing calendar event, collect explicit host and visitor confirmation, request access when required, and coordinate reception and arrival instructions without granting physical access.",
  },
  read: {
    mode: "read", risk: "low", reversible: true,
    aliases: ["show visitor coordination", "visitor status", "is the guest visit ready", "show access request status"],
    description: "Read visitor, host, reception, arrival-instruction and externally evidenced access-decision state without changing anything.",
  },
  recordHostResponse: {
    mode: "write", risk: "low", reversible: true,
    aliases: ["record host confirmation", "host confirmed the visitor", "host declined the visitor"],
    description: "Record an explicit evidence-backed host yes/no response. Silence is never confirmation and host confirmation never grants physical access.",
  },
  recordVisitorResponse: {
    mode: "write", risk: "low", reversible: true,
    aliases: ["record visitor confirmation", "guest confirmed the visit", "visitor declined the visit"],
    description: "Record an explicit evidence-backed visitor yes/no response. Silence is never confirmation and visitor confirmation never grants physical access.",
  },
  recordAccessDecision: {
    mode: "write", risk: "medium", reversible: true,
    aliases: ["record visitor access decision", "security approved visitor access", "security denied visitor access"],
    description: "Record an explicit access decision only when evidence and the configured access-authority party are supplied. The Secretary records the external authority decision but never creates, grants, issues, activates or infers physical access.",
  },
  refresh: {
    mode: "write", risk: "medium", reversible: true,
    aliases: ["refresh visitor coordination", "recoordinate changed visitor appointment", "update visitor coordination from calendar"],
    description: "Reconcile visitor coordination with the current calendar event. Schedule or location changes fence stale notices and require fresh host, visitor, and where applicable access confirmation.",
  },
  acknowledge: {
    mode: "write", risk: "low", reversible: true,
    aliases: ["record arrival instructions received", "visitor got the arrival instructions", "guest acknowledged directions"],
    description: "Record an evidence-backed acknowledgement of arrival instructions. Receipt acknowledgement is not arrival, admission, access approval, or attendance evidence.",
  },
  recordArrival: {
    mode: "write", risk: "low", reversible: true,
    aliases: ["record visitor arrived", "record visitor departed", "record visitor no show"],
    description: "Record an explicit evidence-backed arrival, departure, or no-show report. The Secretary never infers arrival, admission, or physical access from other signals.",
  },
  cancel: {
    mode: "write", risk: "medium", reversible: true,
    aliases: ["cancel visitor coordination", "stop coordinating this guest", "cancel guest logistics"],
    description: "Cancel the Secretary visitor-coordination workflow and its pending follow-ups without cancelling the underlying calendar event or revoking physical access outside the Secretary's authority.",
  },
});

function commonProperties() {
  return {
    calendar_event_id: { type: "string" },
    visitor_party_id: { type: "string" },
  };
}

function arrivalInstructionSchema() {
  return {
    type: "object",
    properties: {
      address: { type: "string" },
      entrance: { type: "string" },
      check_in_point: { type: "string" },
      parking: { type: "string" },
      contact_note: { type: "string" },
      notes: { type: "string" },
    },
    additionalProperties: false,
  };
}

function schema(action) {
  if (action === "start") {
    return {
      type: "object",
      properties: {
        ...commonProperties(),
        host_party_id: { type: "string" },
        reception_party_id: { type: "string" },
        security_party_id: { type: "string" },
        access_required: { type: "boolean" },
        badge_required: { type: "boolean" },
        parking_required: { type: "boolean" },
        escort_required: { type: "boolean" },
        host_confirmed: { type: "boolean" },
        host_confirmation_evidence_id: { type: "string" },
        visitor_confirmed: { type: "boolean" },
        visitor_confirmation_evidence_id: { type: "string" },
        arrival_instructions: arrivalInstructionSchema(),
      },
      required: ["calendar_event_id"],
      additionalProperties: false,
    };
  }
  if (action === "read" || action === "refresh" || action === "cancel") {
    return {
      type: "object",
      properties: { ...commonProperties(), ...(action === "cancel" ? { reason: { type: "string" } } : {}) },
      required: ["calendar_event_id"],
      additionalProperties: false,
    };
  }
  if (action === "recordHostResponse" || action === "recordVisitorResponse") {
    return {
      type: "object",
      properties: {
        ...commonProperties(),
        party_id: { type: "string" },
        evidence_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["calendar_event_id", "evidence_id", "confirmed"],
      additionalProperties: false,
    };
  }
  if (action === "recordAccessDecision") {
    return {
      type: "object",
      properties: {
        ...commonProperties(),
        decision: { type: "string", enum: ["APPROVED", "DENIED"] },
        decision_by_party_id: { type: "string" },
        evidence_id: { type: "string" },
      },
      required: ["calendar_event_id", "decision", "decision_by_party_id", "evidence_id"],
      additionalProperties: false,
    };
  }
  if (action === "acknowledge") {
    return {
      type: "object",
      properties: {
        ...commonProperties(),
        evidence_id: { type: "string" },
        acknowledged: { type: "boolean", const: true },
      },
      required: ["calendar_event_id", "evidence_id", "acknowledged"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      ...commonProperties(),
      state: { type: "string", enum: ["ARRIVED_AT_RECEPTION", "DEPARTED", "NO_SHOW_REPORTED"] },
      recorded_by_party_id: { type: "string" },
      evidence_id: { type: "string" },
    },
    required: ["calendar_event_id", "state", "recorded_by_party_id", "evidence_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryVisitorCoordinationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_VISITOR_COORDINATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_visitor_coordination",
    action,
    name: `Executive Secretary visitor coordination ${action}`,
    document: "secretary_visitor_coordination",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_visitor_coordination.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "visitor", "guest", "reception", "access", config.mode],
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
    reversible: config.reversible,
    approval: { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    if (action === "start") return startSecretaryVisitorCoordination({ context, payload });
    if (action === "read") return readSecretaryVisitorCoordination({ context, payload });
    if (action === "recordHostResponse") return recordSecretaryVisitorHostResponse({ context, payload });
    if (action === "recordVisitorResponse") return recordSecretaryVisitorResponse({ context, payload });
    if (action === "recordAccessDecision") return recordSecretaryVisitorAccessDecision({ context, payload });
    if (action === "refresh") return refreshSecretaryVisitorCoordination({ context, payload });
    if (action === "acknowledge") return recordSecretaryVisitorArrivalInstructionAcknowledgement({ context, payload });
    if (action === "recordArrival") return recordSecretaryVisitorArrivalEvidence({ context, payload });
    if (action === "cancel") return cancelSecretaryVisitorCoordination({ context, payload });
    throw new Error(`SECRETARY_VISITOR_COORDINATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryVisitorCoordinationCapability;
