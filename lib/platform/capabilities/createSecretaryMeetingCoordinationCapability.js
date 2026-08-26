import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryMeetingCoordination,
  createSecretaryMeetingCoordination,
  readSecretaryMeetingCoordination,
} from "@/lib/operator/secretary/SecretaryMeetingCoordinationRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  coordinate: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    aliases: [
      "coordinate this meeting",
      "find a time for everyone",
      "schedule a meeting with these people",
      "collect everyone's availability",
      "secretary arrange this meeting",
    ],
    description: "Coordinate a multi-party meeting by asking known contacts for explicit availability against exact candidate slots, chasing unanswered requests, and booking only an explicitly common slot through the native atomic Secretary calendar.",
  },
  status: {
    mode: "read",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: [
      "show meeting coordination status",
      "who replied about the meeting",
      "whose availability are we waiting for",
      "show scheduling status",
    ],
    description: "Read the evidence-backed state of one Secretary multi-party meeting coordination without changing outreach, attendance or calendar state.",
  },
  cancel: {
    mode: "write",
    risk: "medium",
    reversible: false,
    confirm: true,
    aliases: [
      "cancel this meeting coordination",
      "stop arranging this meeting",
      "stop chasing availability for this meeting",
    ],
    description: "Cancel one not-yet-booked Secretary meeting coordination and its pending availability outreach. A booked calendar event is never cancelled by this action.",
  },
});

function schema(action) {
  if (action === "coordinate") {
    return {
      type: "object",
      properties: {
        title: { type: "string" },
        purpose: { type: "string" },
        location: { type: "string" },
        timezone: { type: "string" },
        owner_party_id: { type: "string" },
        entity_id: { type: "string" },
        response_due_at: { type: "string" },
        reminder_after_minutes: { type: "number" },
        max_attempts: { type: "number" },
        candidate_slots: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              starts_at: { type: "string" },
              ends_at: { type: "string" },
              timezone: { type: "string" },
              label: { type: "string" },
            },
            required: ["starts_at", "ends_at"],
            additionalProperties: false,
          },
        },
        participants: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              party_id: { type: "string" },
              required: { type: "boolean" },
              action_type: { type: "string", enum: ["MESSAGE", "EMAIL", "CALL"] },
            },
            required: ["party_id"],
            additionalProperties: false,
          },
        },
        metadata: { type: "object" },
      },
      required: ["title", "timezone", "candidate_slots", "participants", "response_due_at"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: { coordination_id: { type: "string" } },
    required: ["coordination_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryMeetingCoordinationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_MEETING_COORDINATION_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_coordination",
    action,
    name: `Executive Secretary meeting coordination ${action}`,
    document: "secretary_meeting_coordination",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_meeting_coordination.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "scheduling", "availability", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode === "read" ? "read" : "write",
    operatorAutoExecute: config.mode === "read",
    operatorRequiresConfirmation: config.confirm,
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
    if (action === "coordinate") return createSecretaryMeetingCoordination({ context, payload });
    if (action === "status") return readSecretaryMeetingCoordination({ context, payload });
    if (action === "cancel") return cancelSecretaryMeetingCoordination({ context, payload });
    throw new Error(`SECRETARY_MEETING_COORDINATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingCoordinationCapability;
