import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  listSecretaryExecutiveProtections,
  protectSecretaryExecutiveTime,
  releaseSecretaryExecutiveProtection,
  reviewSecretaryExecutiveCalendar,
} from "@/lib/operator/secretary/SecretaryExecutiveCalendarStewardshipRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  review: {
    mode: "read",
    aliases: ["review my day", "check my calendar buffers", "show calendar risks", "is my schedule too tight"],
    description: "Review the executive calendar for overlaps and explicit buffer shortfalls using only recorded working preferences or explicit request values. This never infers meeting importance or travel time and performs no calendar mutation.",
    execute: reviewSecretaryExecutiveCalendar,
  },
  protect: {
    mode: "write",
    aliases: ["protect this time", "block focus time", "reserve prep time", "keep this time free"],
    description: "Create an atomic Avantiqo-owned protection block for an explicitly stated executive calendar window. Existing meetings are never moved or cancelled to make room.",
    execute: protectSecretaryExecutiveTime,
  },
  release: {
    mode: "write",
    aliases: ["release this protected time", "remove this focus block", "free this protected window"],
    description: "Release only a calendar protection block previously created by Executive Calendar Stewardship. External meetings and other calendar events cannot be cancelled through this action.",
    execute: releaseSecretaryExecutiveProtection,
  },
  list: {
    mode: "read",
    aliases: ["show protected time", "show my focus blocks", "list calendar protections"],
    description: "List Avantiqo-owned executive calendar protection blocks separately from meetings and appointments.",
    execute: listSecretaryExecutiveProtections,
  },
});

function schema(action) {
  if (action === "review") return {
    type: "object",
    properties: {
      from: { type: "string" },
      to: { type: "string" },
      buffer_before_minutes: { type: "number" },
      buffer_after_minutes: { type: "number" },
      location_change_buffer_minutes: { type: "number" },
    },
    required: ["from", "to"],
    additionalProperties: false,
  };
  if (action === "protect") return {
    type: "object",
    properties: {
      protection_kind: { type: "string", enum: ["FOCUS", "PREP", "BUFFER", "PERSONAL", "TRAVEL"] },
      title: { type: "string" },
      description: { type: "string" },
      starts_at: { type: "string" },
      ends_at: { type: "string" },
      timezone: { type: "string" },
      location: { type: "string" },
      entity_id: { type: "string" },
      evidence_id: { type: "string" },
    },
    required: ["starts_at", "ends_at", "evidence_id"],
    additionalProperties: false,
  };
  if (action === "release") return {
    type: "object",
    properties: {
      protection_event_id: { type: "string" },
      evidence_id: { type: "string" },
      released_at: { type: "string" },
      reason: { type: "string" },
    },
    required: ["protection_event_id", "evidence_id", "released_at"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      include_released: { type: "boolean" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryExecutiveCalendarStewardshipCapability(action = "review") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_CALENDAR_STEWARDSHIP_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_calendar_stewardship",
    action,
    name: `Executive Secretary calendar stewardship ${action}`,
    document: "secretary_calendar_stewardship",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_calendar_stewardship.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "calendar", "stewardship", "focus", "buffers", config.mode],
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

export default createSecretaryExecutiveCalendarStewardshipCapability;
