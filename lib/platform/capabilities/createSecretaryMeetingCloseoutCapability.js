import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryMeetingCloseout,
  readSecretaryMeetingCloseout,
  recordSecretaryMeetingCloseoutResponse,
  refreshSecretaryMeetingCloseout,
  startSecretaryMeetingCloseout,
} from "@/lib/operator/secretary/SecretaryMeetingCloseoutRuntime";
import { reviseSecretaryMeetingMinutes } from "@/lib/operator/secretary/SecretaryMeetingMinutesRevisionRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    risk: "medium",
    reversible: true,
    aliases: ["close out the meeting", "send the meeting minutes", "distribute meeting minutes", "send the meeting protocol", "send the meeting action items"],
    description: "Start durable post-meeting closeout for one completed meeting, queue evidence-backed minutes/action-item distribution through existing governed communication paths, and optionally track receipt acknowledgement without inferring attendance, approval or agreement.",
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    aliases: ["show meeting closeout", "show minutes distribution status", "who acknowledged the meeting minutes", "show meeting minutes acknowledgements"],
    description: "Read meeting closeout state, recipients, distribution follow-ups, acknowledgement evidence and correction requests without changing anything.",
  },
  recordResponse: {
    mode: "write",
    risk: "low",
    reversible: true,
    aliases: ["record minutes acknowledgement", "record meeting minutes receipt", "record correction to the minutes", "they corrected the meeting minutes"],
    description: "Record explicit receipt acknowledgement or factual correction evidence for a meeting closeout. Acknowledgement is administrative evidence only and never becomes approval, acceptance, attendance or agreement.",
  },
  reviseMinutes: {
    mode: "write",
    risk: "medium",
    reversible: true,
    aliases: ["revise the meeting minutes", "correct the meeting minutes", "issue corrected meeting minutes", "send revised meeting minutes"],
    description: "Apply an explicit evidence-backed factual revision to the current meeting minutes, preserve prior versions, stale-fence superseded revisions and distributions, reset acknowledgements for the new version, and queue deterministic revised-minutes redistribution without changing the captured meeting record or creating approval, acceptance, attendance or binding authority.",
  },
  refresh: {
    mode: "write",
    risk: "low",
    reversible: true,
    aliases: ["refresh meeting closeout", "check meeting minutes acknowledgements", "chase missing minutes acknowledgements", "update meeting closeout status"],
    description: "Refresh meeting closeout from durable distribution evidence and create deterministic acknowledgement chases only when an acknowledgement deadline has passed and explicit response evidence is still missing.",
  },
  cancel: {
    mode: "write",
    risk: "medium",
    reversible: true,
    aliases: ["cancel meeting closeout", "stop chasing meeting minutes acknowledgements", "stop meeting minutes follow-up"],
    description: "Cancel pending meeting-closeout follow-through without cancelling or changing the underlying completed meeting or calendar event.",
  },
});

function recipientSchema() {
  return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      action_type: { type: "string", enum: ["MESSAGE", "EMAIL"] },
    },
    required: ["party_id"],
    additionalProperties: false,
  };
}

function schema(action) {
  if (action === "start") {
    return {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        recipients: { type: "array", maxItems: 100, items: recipientSchema() },
        acknowledgement_required: { type: "boolean" },
        acknowledgement_due_at: { type: "string" },
      },
      required: ["meeting_id"],
      additionalProperties: false,
    };
  }
  if (action === "read" || action === "refresh") {
    return {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        ...(action === "refresh" ? { now: { type: "string" } } : {}),
      },
      required: ["meeting_id"],
      additionalProperties: false,
    };
  }
  if (action === "recordResponse") {
    return {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        recipient_party_id: { type: "string" },
        evidence_id: { type: "string" },
        response_kind: { type: "string", enum: ["ACKNOWLEDGED", "CORRECTION_REQUESTED"] },
        correction_text: { type: "string" },
      },
      required: ["meeting_id", "recipient_party_id", "evidence_id", "response_kind"],
      additionalProperties: false,
    };
  }
  if (action === "reviseMinutes") {
    return {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        supersedes_version: { type: "number" },
        evidence_id: { type: "string" },
        correction_reason: { type: "string" },
        revised_minutes_body: { type: "string" },
        acknowledgement_due_at: { type: "string" },
      },
      required: ["meeting_id", "supersedes_version", "evidence_id", "revised_minutes_body"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      meeting_id: { type: "string" },
      reason: { type: "string" },
    },
    required: ["meeting_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryMeetingCloseoutCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_MEETING_CLOSEOUT_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_closeout",
    action,
    name: `Executive Secretary meeting closeout ${action}`,
    document: "secretary_meeting_closeout",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_meeting_closeout.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "minutes", "closeout", config.mode],
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
    if (action === "start") return startSecretaryMeetingCloseout({ context, payload });
    if (action === "read") return readSecretaryMeetingCloseout({ context, payload });
    if (action === "recordResponse") return recordSecretaryMeetingCloseoutResponse({ context, payload });
    if (action === "reviseMinutes") return reviseSecretaryMeetingMinutes({ context, payload });
    if (action === "refresh") return refreshSecretaryMeetingCloseout({ context, payload });
    if (action === "cancel") return cancelSecretaryMeetingCloseout({ context, payload });
    throw new Error(`SECRETARY_MEETING_CLOSEOUT_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingCloseoutCapability;
