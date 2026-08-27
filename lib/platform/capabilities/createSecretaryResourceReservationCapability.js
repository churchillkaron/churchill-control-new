import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  reserveSecretaryResource,
  changeSecretaryResourceReservation,
  releaseSecretaryResourceReservation,
  readSecretaryResourceReservation,
  listSecretaryResourceReservations,
} from "@/lib/operator/secretary/SecretaryResourceReservationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  reserve: {
    mode: "write",
    risk: "medium",
    reversible: true,
    aliases: ["reserve meeting room", "book internal room", "reserve equipment", "hold this resource"],
    description: "Atomically reserve an Avantiqo-internal room, equipment item, vehicle, desk, space or other resource for an explicit time window. This creates no calendar event and performs no external booking.",
    execute: reserveSecretaryResource,
  },
  change: {
    mode: "write",
    risk: "medium",
    reversible: true,
    aliases: ["move room reservation", "change resource reservation", "reschedule room", "change equipment reservation"],
    description: "Atomically change the time/details of an existing internal resource reservation while preserving overlap protection and without changing any linked calendar event.",
    execute: changeSecretaryResourceReservation,
  },
  release: {
    mode: "write",
    risk: "medium",
    reversible: false,
    aliases: ["release meeting room", "cancel room reservation", "release equipment", "free this resource"],
    description: "Release an Avantiqo-internal resource allocation. This does not cancel a linked meeting, external booking, or Office Administration room-setup request.",
    execute: releaseSecretaryResourceReservation,
  },
  read: {
    mode: "read",
    risk: "low",
    reversible: true,
    aliases: ["show room reservation", "read resource reservation", "show reserved resource"],
    description: "Read one exact internal Secretary resource reservation and its evidence/version history.",
    execute: readSecretaryResourceReservation,
  },
  list: {
    mode: "read",
    risk: "low",
    reversible: true,
    aliases: ["show room bookings", "list resource reservations", "what rooms are reserved", "show equipment reservations"],
    description: "List organization-scoped internal Secretary resource reservations with optional resource/time filters.",
    execute: listSecretaryResourceReservations,
  },
});

function schemaFor(action) {
  const resourceFields = {
    resource_key: { type: "string" },
    resource_name: { type: "string" },
    resource_type: { type: "string", enum: ["ROOM", "EQUIPMENT", "VEHICLE", "DESK", "SPACE", "OTHER"] },
    starts_at: { type: "string" },
    ends_at: { type: "string" },
    timezone: { type: "string" },
    purpose: { type: "string" },
    location: { type: "string" },
    capacity: { type: "integer", minimum: 1 },
    calendar_event_id: { type: "string" },
  };
  switch (action) {
    case "reserve":
      return {
        type: "object",
        properties: {
          ...resourceFields,
          entity_id: { type: "string" },
          evidence_id: { type: "string" },
          reserved_at: { type: "string" },
        },
        required: ["resource_key", "resource_type", "starts_at", "ends_at", "evidence_id", "reserved_at"],
        additionalProperties: false,
      };
    case "change":
      return {
        type: "object",
        properties: {
          reservation_id: { type: "string" },
          expected_version: { type: "integer", minimum: 1 },
          starts_at: { type: "string" },
          ends_at: { type: "string" },
          timezone: { type: "string" },
          purpose: { type: "string" },
          location: { type: "string" },
          capacity: { type: "integer", minimum: 1 },
          calendar_event_id: { type: "string" },
          evidence_id: { type: "string" },
          changed_at: { type: "string" },
        },
        required: ["reservation_id", "expected_version", "starts_at", "ends_at", "evidence_id", "changed_at"],
        additionalProperties: false,
      };
    case "release":
      return {
        type: "object",
        properties: {
          reservation_id: { type: "string" },
          expected_version: { type: "integer", minimum: 1 },
          evidence_id: { type: "string" },
          released_at: { type: "string" },
          reason: { type: "string" },
        },
        required: ["reservation_id", "expected_version", "evidence_id", "released_at", "reason"],
        additionalProperties: false,
      };
    case "read":
      return {
        type: "object",
        properties: { reservation_id: { type: "string" } },
        required: ["reservation_id"],
        additionalProperties: false,
      };
    case "list":
      return {
        type: "object",
        properties: {
          resource_key: { type: "string" },
          resource_type: { type: "string", enum: ["ROOM", "EQUIPMENT", "VEHICLE", "DESK", "SPACE", "OTHER"] },
          from: { type: "string" },
          to: { type: "string" },
          include_released: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 300 },
        },
        additionalProperties: false,
      };
    default:
      return { type: "object", additionalProperties: false };
  }
}

export function createSecretaryResourceReservationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_RESOURCE_RESERVATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_resource_reservation",
    action,
    name: `Secretary resource reservation ${action}`,
    document: "secretary_resource_reservation",
    description: config.description,
    permissions: [],
    events: [`platform.secretary.resource_reservation.${action}`],
    tags: ["platform", "secretary", "resource", "reservation", "internal", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.risk,
    reversible: config.reversible,
    approval: { required: false },
    inputSchema: schemaFor(action),
  });
  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && text(context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId, 120));
  }
  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }
  return { manifest, authorize, execute };
}

export default createSecretaryResourceReservationCapability;
