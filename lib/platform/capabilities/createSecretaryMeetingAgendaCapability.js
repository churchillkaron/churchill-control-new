import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  addSecretaryMeetingAgendaItem,
  distributeSecretaryMeetingAgenda,
  finalizeSecretaryMeetingAgenda,
  readSecretaryMeetingAgenda,
  recordSecretaryMeetingAgendaAcknowledgement,
  recordSecretaryMeetingAgendaContribution,
  reviseSecretaryMeetingAgenda,
  startSecretaryMeetingAgenda,
} from "@/lib/operator/secretary/SecretaryMeetingAgendaRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    aliases: ["prepare the meeting agenda", "collect agenda items", "start agenda collection", "get the agenda ready"],
    description: "Start a durable Secretary-owned meeting agenda lifecycle for one existing calendar event, collect participant agenda input through governed follow-ups, chase once before the collection deadline, and never infer attendance or RSVP.",
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: ["show the meeting agenda", "show agenda status", "who has sent agenda items", "who acknowledged the agenda"],
    description: "Read the current agenda state, version history, participant contribution status, distribution state, acknowledgements, and Secretary-owned follow-ups without changing anything.",
  },
  addItem: {
    mode: "write",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: ["add this to the agenda", "add an agenda item", "put this on the meeting agenda"],
    description: "Add explicit agenda items to an agenda that is still being prepared. Finalized agendas must be reopened through the revision action so prior versions remain preserved.",
  },
  recordContribution: {
    mode: "write",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: ["record their agenda items", "add the agenda items they sent", "mark their agenda contribution received"],
    description: "Record agenda contribution items only when explicit evidence is supplied. Participant silence is never treated as a contribution, acknowledgement, RSVP, or attendance evidence.",
  },
  finalize: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    aliases: ["finalize the agenda", "lock the meeting agenda", "finish the agenda"],
    description: "Create an immutable version snapshot of the current agenda and pre-read references, preserve missing-contribution evidence, and fence pending collection follow-ups.",
  },
  revise: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    aliases: ["revise the finalized agenda", "update the distributed agenda", "create a new agenda version"],
    description: "Open a new agenda revision while preserving every prior finalized version and cancelling stale pending distribution or acknowledgement follow-ups for the superseded version.",
  },
  distribute: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    aliases: ["send the agenda", "distribute the agenda", "send everyone the pre-read", "share the finalized meeting agenda"],
    description: "Queue deterministic Secretary-owned agenda and pre-read distribution follow-ups through each participant's existing governed communication path. The runtime does not infer delivery, RSVP, attendance, or approval.",
  },
  acknowledge: {
    mode: "write",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: ["mark the agenda received", "record agenda receipt acknowledgement", "they confirmed receipt of the agenda"],
    description: "Record only an explicit agenda-receipt acknowledgement backed by evidence. Receipt acknowledgement never becomes RSVP or attendance confirmation.",
  },
});

function itemSchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      details: { type: "string" },
      owner_party_id: { type: "string" },
      source_kind: { type: "string" },
      source_party_id: { type: "string" },
      evidence_id: { type: "string" },
    },
    required: ["title"],
    additionalProperties: false,
  };
}

function participantSchema() {
  return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      required: { type: "boolean" },
      action_type: { type: "string", enum: ["MESSAGE", "EMAIL"] },
    },
    required: ["party_id"],
    additionalProperties: false,
  };
}

function referenceSchema() {
  return {
    type: "object",
    properties: {
      label: { type: "string" },
      reference: { type: "string" },
      source_kind: { type: "string" },
    },
    required: ["reference"],
    additionalProperties: false,
  };
}

function commonEventIdProperties() {
  return { calendar_event_id: { type: "string" } };
}

function schema(action) {
  if (action === "start") {
    return {
      type: "object",
      properties: {
        ...commonEventIdProperties(),
        collection_deadline: { type: "string" },
        chase_at: { type: "string" },
        items: { type: "array", maxItems: 40, items: itemSchema() },
        pre_read_references: { type: "array", maxItems: 20, items: referenceSchema() },
        participants: { type: "array", maxItems: 50, items: participantSchema() },
      },
      required: ["calendar_event_id"],
      additionalProperties: false,
    };
  }
  if (action === "read") {
    return { type: "object", properties: commonEventIdProperties(), required: ["calendar_event_id"], additionalProperties: false };
  }
  if (action === "addItem") {
    return {
      type: "object",
      properties: { ...commonEventIdProperties(), items: { type: "array", minItems: 1, maxItems: 40, items: itemSchema() } },
      required: ["calendar_event_id", "items"],
      additionalProperties: false,
    };
  }
  if (action === "recordContribution") {
    return {
      type: "object",
      properties: {
        ...commonEventIdProperties(),
        participant_party_id: { type: "string" },
        evidence_id: { type: "string" },
        items: { type: "array", minItems: 1, maxItems: 40, items: itemSchema() },
      },
      required: ["calendar_event_id", "participant_party_id", "evidence_id", "items"],
      additionalProperties: false,
    };
  }
  if (action === "finalize") {
    return {
      type: "object",
      properties: { ...commonEventIdProperties(), allow_missing_contributions: { type: "boolean" }, change_note: { type: "string" } },
      required: ["calendar_event_id"],
      additionalProperties: false,
    };
  }
  if (action === "revise") {
    return {
      type: "object",
      properties: {
        ...commonEventIdProperties(),
        items: { type: "array", minItems: 1, maxItems: 40, items: itemSchema() },
        pre_read_references: { type: "array", maxItems: 20, items: referenceSchema() },
        change_note: { type: "string" },
      },
      required: ["calendar_event_id", "items"],
      additionalProperties: false,
    };
  }
  if (action === "distribute") {
    return { type: "object", properties: commonEventIdProperties(), required: ["calendar_event_id"], additionalProperties: false };
  }
  return {
    type: "object",
    properties: {
      ...commonEventIdProperties(),
      participant_party_id: { type: "string" },
      evidence_id: { type: "string" },
      acknowledged: { type: "boolean", const: true },
    },
    required: ["calendar_event_id", "participant_party_id", "evidence_id", "acknowledged"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryMeetingAgendaCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_MEETING_AGENDA_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_agenda",
    action,
    name: `Executive Secretary meeting agenda ${action}`,
    document: "secretary_meeting_agenda",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_meeting_agenda.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "agenda", "pre-read", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: config.confirm !== true,
    operatorRequiresConfirmation: config.confirm === true,
    contextScope: "organization",
    risk: config.risk,
    reversible: config.reversible,
    approval: config.confirm ? { required: false, boundary: "conversation_confirmation" } : { required: false },
    inputSchema: schema(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && actorPartyId(context));
  }

  async function execute({ context, payload = {} }) {
    if (action === "start") return startSecretaryMeetingAgenda({ context, payload });
    if (action === "read") return readSecretaryMeetingAgenda({ context, payload });
    if (action === "addItem") return addSecretaryMeetingAgendaItem({ context, payload });
    if (action === "recordContribution") return recordSecretaryMeetingAgendaContribution({ context, payload });
    if (action === "finalize") return finalizeSecretaryMeetingAgenda({ context, payload });
    if (action === "revise") return reviseSecretaryMeetingAgenda({ context, payload });
    if (action === "distribute") return distributeSecretaryMeetingAgenda({ context, payload });
    if (action === "acknowledge") return recordSecretaryMeetingAgendaAcknowledgement({ context, payload });
    throw new Error(`SECRETARY_MEETING_AGENDA_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingAgendaCapability;
