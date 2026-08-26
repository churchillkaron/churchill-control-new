import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryRecurringMeetingFuture,
  createSecretaryRecurringMeetingSeries,
  moveSecretaryRecurringMeetingOccurrence,
  readSecretaryRecurringMeetingSeries,
  skipSecretaryRecurringMeetingOccurrence,
} from "@/lib/operator/secretary/SecretaryRecurringMeetingRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  create: {
    mode: "write",
    risk: "high",
    reversible: true,
    confirm: true,
    aliases: [
      "schedule this recurring meeting",
      "create a recurring meeting series",
      "put these recurring meetings on my calendar",
      "schedule this series and tell everyone",
    ],
    description: "Atomically create a finite recurring executive meeting series from explicit occurrence times, reject calendar conflicts, preserve a durable series/occurrence lifecycle, and notify every participant through their existing Secretary channel without inferring RSVP or attendance.",
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    confirm: false,
    aliases: [
      "show recurring meeting series",
      "show the recurring meeting schedule",
      "show recurring meeting occurrences",
    ],
    description: "Read one recurring Secretary meeting series, its participant roster, and all occurrence lifecycle records without changing calendar or communication state.",
  },
  moveOccurrence: {
    mode: "write",
    risk: "high",
    reversible: true,
    confirm: true,
    aliases: [
      "move this recurring meeting occurrence",
      "reschedule only this occurrence",
      "change this week's recurring meeting",
    ],
    description: "Move exactly one recurring meeting occurrence under the owner-calendar lock, leave all other occurrences unchanged, preserve change history, and notify all participants through their existing channels.",
  },
  skipOccurrence: {
    mode: "write",
    risk: "high",
    reversible: false,
    confirm: true,
    aliases: [
      "skip this recurring meeting occurrence",
      "cancel only this occurrence",
      "skip this week's meeting",
    ],
    description: "Skip exactly one recurring meeting occurrence, cancel only its canonical calendar event, preserve the rest of the series and history, and notify every participant.",
  },
  cancelFuture: {
    mode: "write",
    risk: "high",
    reversible: false,
    confirm: true,
    aliases: [
      "cancel future recurring meetings",
      "stop this recurring meeting series",
      "cancel the rest of this series",
      "cancel all future occurrences",
    ],
    description: "Cancel active recurring meeting occurrences at or after an explicit cutoff, preserve past occurrences and evidence, and notify every participant without inferring RSVP or attendance.",
  },
});

function participantSchema() {
  return {
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
  };
}

function schema(action) {
  if (action === "create") {
    return {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        timezone: { type: "string" },
        owner_party_id: { type: "string" },
        entity_id: { type: "string" },
        recurrence_rule: { type: "object" },
        occurrences: {
          type: "array",
          minItems: 2,
          maxItems: 104,
          items: {
            type: "object",
            properties: {
              occurrence_index: { type: "integer", minimum: 1, maximum: 104 },
              starts_at: { type: "string" },
              ends_at: { type: "string" },
            },
            required: ["starts_at", "ends_at"],
            additionalProperties: false,
          },
        },
        participants: participantSchema(),
        metadata: { type: "object" },
      },
      required: ["title", "timezone", "occurrences", "participants"],
      additionalProperties: false,
    };
  }
  if (action === "read") {
    return {
      type: "object",
      properties: { series_id: { type: "string" } },
      required: ["series_id"],
      additionalProperties: false,
    };
  }
  if (action === "moveOccurrence") {
    return {
      type: "object",
      properties: {
        occurrence_id: { type: "string" },
        starts_at: { type: "string" },
        ends_at: { type: "string" },
        timezone: { type: "string" },
        location: { type: "string" },
      },
      required: ["occurrence_id", "starts_at", "ends_at"],
      additionalProperties: false,
    };
  }
  if (action === "skipOccurrence") {
    return {
      type: "object",
      properties: {
        occurrence_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["occurrence_id"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      series_id: { type: "string" },
      from: { type: "string" },
      reason: { type: "string" },
    },
    required: ["series_id", "from"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryRecurringMeetingCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_RECURRING_MEETING_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_recurring_meeting",
    action,
    name: `Executive Secretary recurring meeting ${action}`,
    document: "secretary_recurring_meeting",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_recurring_meeting.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "recurring", "calendar", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: config.mode,
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
    if (action === "create") return createSecretaryRecurringMeetingSeries({ context, payload });
    if (action === "read") return readSecretaryRecurringMeetingSeries({ context, payload });
    if (action === "moveOccurrence") return moveSecretaryRecurringMeetingOccurrence({ context, payload });
    if (action === "skipOccurrence") return skipSecretaryRecurringMeetingOccurrence({ context, payload });
    if (action === "cancelFuture") return cancelSecretaryRecurringMeetingFuture({ context, payload });
    throw new Error(`SECRETARY_RECURRING_MEETING_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryRecurringMeetingCapability;
