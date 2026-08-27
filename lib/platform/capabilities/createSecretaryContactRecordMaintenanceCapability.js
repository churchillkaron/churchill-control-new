import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  readSecretaryContactRecordMaintenance,
  updateSecretaryContactRecord,
} from "@/lib/operator/secretary/SecretaryContactRecordMaintenanceRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  update: {
    mode: "write",
    aliases: ["update contact details", "correct contact email", "change contact phone", "update contact address", "correct contact name"],
    description: "Correct selected fields on an existing canonical contact from explicit evidence. The Secretary preserves before/after history, blocks duplicate email/phone collisions, and never infers identity or relationship facts.",
    execute: updateSecretaryContactRecord,
  },
  read: {
    mode: "read",
    aliases: ["show contact change history", "read contact maintenance", "show contact corrections"],
    description: "Read the current canonical contact plus Secretary-maintained evidence-backed correction history.",
    execute: readSecretaryContactRecordMaintenance,
  },
});

function schema(action) {
  if (action === "update") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      evidence_id: { type: "string" },
      evidence_at: { type: "string" },
      expected_updated_at: { type: "string" },
      reason: { type: "string" },
      display_name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      legal_name: { type: "string" },
      address: { type: "string" },
      clear_fields: { type: "array", items: { type: "string", enum: ["email", "phone", "legal_name", "address"] } },
    },
    required: ["party_id", "evidence_id", "evidence_at", "expected_updated_at", "reason"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { party_id: { type: "string" } },
    required: ["party_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryContactRecordMaintenanceCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_contact_record_maintenance",
    action,
    name: `Executive Secretary contact record maintenance ${action}`,
    document: "secretary_contact_record_maintenance",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_contact_record_maintenance.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "contacts", "records", "maintenance", config.mode],
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

export default createSecretaryContactRecordMaintenanceCapability;
