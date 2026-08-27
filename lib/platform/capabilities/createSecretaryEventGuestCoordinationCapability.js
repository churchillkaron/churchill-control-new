import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  startSecretaryEventGuestCoordination,
  addSecretaryEventGuest,
  recordSecretaryEventGuestInvitation,
  recordSecretaryEventGuestResponse,
  remindSecretaryEventGuest,
  finalizeSecretaryEventGuestList,
  reopenSecretaryEventGuestList,
  cancelSecretaryEventGuestCoordination,
  readSecretaryEventGuestCoordination,
  listSecretaryEventGuestCoordinations,
} from "@/lib/operator/secretary/SecretaryEventGuestCoordinationRuntime";

const ACTIONS = {
  start: { mode: "write", execute: startSecretaryEventGuestCoordination, aliases: ["coordinate event guests", "manage guest list", "invite event guests"] },
  addGuest: { mode: "write", execute: addSecretaryEventGuest, aliases: ["add guest", "add invitee"] },
  recordInvitation: { mode: "write", execute: recordSecretaryEventGuestInvitation, aliases: ["record invitation delivery", "mark invitation sent"] },
  recordResponse: { mode: "write", execute: recordSecretaryEventGuestResponse, aliases: ["record rsvp", "record guest response"] },
  remind: { mode: "write", execute: remindSecretaryEventGuest, aliases: ["remind guest", "chase rsvp"] },
  finalize: { mode: "write", execute: finalizeSecretaryEventGuestList, aliases: ["finalize guest list", "close rsvp list"] },
  reopen: { mode: "write", execute: reopenSecretaryEventGuestList, aliases: ["reopen guest list"] },
  cancel: { mode: "write", execute: cancelSecretaryEventGuestCoordination, aliases: ["cancel guest coordination"] },
  read: { mode: "read", execute: readSecretaryEventGuestCoordination, aliases: ["show guest coordination", "show guest list"] },
  list: { mode: "read", execute: listSecretaryEventGuestCoordinations, aliases: ["list event guest coordinations", "list guest lists"] },
};

function schemaFor(action) {
  const commonMutation = {
    coordination_id: { type: "string" }, expected_version: { type: "number" }, evidence_id: { type: "string" }, occurred_at: { type: "string" },
  };
  switch (action) {
    case "start": return { type: "object", properties: { calendar_event_id: { type: "string" }, title: { type: "string" }, starts_at: { type: "string" }, ends_at: { type: "string" }, timezone: { type: "string" }, location: { type: "string" }, invitation_due_at: { type: "string" }, guests: { type: "array", items: { type: "object", properties: { party_id: { type: "string" }, role: { type: "string" }, note: { type: "string" }, response_required: { type: "boolean" }, action_type: { type: "string" } }, required: ["party_id"], additionalProperties: false } }, evidence_id: { type: "string" }, started_at: { type: "string" }, entity_id: { type: "string" } }, required: ["guests", "evidence_id", "started_at"], additionalProperties: false };
    case "addGuest": return { type: "object", properties: { ...commonMutation, party_id: { type: "string" }, role: { type: "string" }, note: { type: "string" }, response_required: { type: "boolean" }, action_type: { type: "string" } }, required: ["coordination_id","expected_version","evidence_id","occurred_at","party_id"], additionalProperties: false };
    case "recordInvitation": return { type: "object", properties: { ...commonMutation, party_id: { type: "string" }, invitation_status: { type: "string" } }, required: ["coordination_id","expected_version","evidence_id","occurred_at","party_id","invitation_status"], additionalProperties: false };
    case "recordResponse": return { type: "object", properties: { ...commonMutation, party_id: { type: "string" }, response_status: { type: "string" }, note: { type: "string" } }, required: ["coordination_id","expected_version","evidence_id","occurred_at","party_id","response_status"], additionalProperties: false };
    case "remind": return { type: "object", properties: { ...commonMutation, party_id: { type: "string" }, due_at: { type: "string" } }, required: ["coordination_id","expected_version","evidence_id","occurred_at","party_id"], additionalProperties: false };
    case "finalize":
    case "reopen": return { type: "object", properties: commonMutation, required: ["coordination_id","expected_version","evidence_id","occurred_at"], additionalProperties: false };
    case "cancel": return { type: "object", properties: { ...commonMutation, reason: { type: "string" } }, required: ["coordination_id","expected_version","evidence_id","occurred_at","reason"], additionalProperties: false };
    case "read": return { type: "object", properties: { coordination_id: { type: "string" } }, required: ["coordination_id"], additionalProperties: false };
    case "list": return { type: "object", properties: { include_cancelled: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
    default: return { type: "object", additionalProperties: false };
  }
}

export function createSecretaryEventGuestCoordinationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_EVENT_GUEST_CAPABILITY_ACTION_UNSUPPORTED:${action}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_event_guest_coordination",
    action,
    name: `Secretary event guest coordination ${action}`,
    document: "secretary_event_guest_coordination",
    description: "Coordinate event guest lists, invitation follow-through, explicit RSVP evidence, reminders, and finalization without granting access or mutating calendar events.",
    permissions: [],
    events: [`platform.secretary.event_guest_coordination.${action}`],
    tags: ["platform", "secretary", "event", "guest-list", "rsvp", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: schemaFor(action),
  });
  function authorize({ context }) { return Boolean(context?.organizationId && (context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id)); }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryEventGuestCoordinationCapability;
