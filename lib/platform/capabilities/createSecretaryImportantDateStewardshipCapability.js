import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  listSecretaryUpcomingImportantDates,
  readSecretaryImportantDates,
  refreshSecretaryImportantDateReminders,
  registerSecretaryImportantDate,
  retireSecretaryImportantDate,
  reviseSecretaryImportantDate,
} from "@/lib/operator/secretary/SecretaryImportantDateStewardshipRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  register: {
    mode: "write",
    aliases: ["remember this birthday", "track this anniversary", "remember this important date", "track this relationship milestone"],
    description: "Register one explicit evidence-backed important date for a known contact and configure internal Secretary reminder stewardship without inferring dates, age, relationship importance, or permission to contact or purchase anything.",
    execute: registerSecretaryImportantDate,
  },
  revise: {
    mode: "write",
    aliases: ["correct this birthday", "change this anniversary date", "revise this important date"],
    description: "Revise an important date from explicit correction evidence while preserving the prior relationship-memory fact and cancelling reminders created from the superseded date.",
    execute: reviseSecretaryImportantDate,
  },
  retire: {
    mode: "write",
    aliases: ["stop tracking this important date", "retire this birthday reminder", "remove this anniversary from active reminders"],
    description: "Retire an important date from active stewardship while preserving historical evidence and cancelling only pending reminders owned by this lifecycle.",
    execute: retireSecretaryImportantDate,
  },
  refresh: {
    mode: "write",
    aliases: ["refresh important date reminders", "prepare birthday reminders", "materialize anniversary reminders"],
    description: "Materialize deterministic internal REVIEW follow-ups for evidence-backed important dates inside a bounded horizon. This sends no external message and performs no purchase, booking, or calendar mutation.",
    execute: refreshSecretaryImportantDateReminders,
  },
  read: {
    mode: "read",
    aliases: ["show this contact's important dates", "what birthdays do we know for this contact", "show tracked milestones for this contact"],
    description: "Read the evidence-backed important-date stewardship records for one known contact, including next occurrence computed from the explicit stored rule.",
    execute: readSecretaryImportantDates,
  },
  listUpcoming: {
    mode: "read",
    aliases: ["what birthdays are coming up", "show upcoming anniversaries", "show important dates coming soon", "which relationship milestones are approaching"],
    description: "List upcoming evidence-backed important dates across organization contacts for a bounded window without inferring missing dates or relationship importance.",
    execute: listSecretaryUpcomingImportantDates,
  },
});

function schema(action) {
  if (action === "register") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      kind: { type: "string", enum: ["BIRTHDAY", "ANNIVERSARY", "RELATIONSHIP_MILESTONE", "PERSONAL_MILESTONE", "OTHER"] },
      label: { type: "string" },
      recurrence: { type: "string", enum: ["ANNUAL", "NONE"] },
      month_day: { type: "string" },
      occurs_on: { type: "string" },
      leap_day_policy: { type: "string", enum: ["FEB_28", "MAR_01", "SKIP"] },
      timezone: { type: "string" },
      reminder_days_before: { type: "array", items: { type: "number" } },
      reminder_local_time: { type: "string" },
      note: { type: "string" },
      source_reference: { type: "string" },
      evidence_id: { type: "string" },
      recorded_at: { type: "string" },
    },
    required: ["party_id", "kind", "label", "recurrence", "evidence_id", "recorded_at"],
    additionalProperties: false,
  };
  if (action === "revise") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      date_id: { type: "string" },
      expected_version: { type: "number" },
      recurrence: { type: "string", enum: ["ANNUAL", "NONE"] },
      month_day: { type: "string" },
      occurs_on: { type: "string" },
      leap_day_policy: { type: "string", enum: ["FEB_28", "MAR_01", "SKIP"] },
      timezone: { type: "string" },
      reminder_days_before: { type: "array", items: { type: "number" } },
      reminder_local_time: { type: "string" },
      note: { type: "string" },
      source_reference: { type: "string" },
      reason: { type: "string" },
      evidence_id: { type: "string" },
      occurred_at: { type: "string" },
    },
    required: ["party_id", "date_id", "expected_version", "reason", "evidence_id", "occurred_at"],
    additionalProperties: false,
  };
  if (action === "retire") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      date_id: { type: "string" },
      expected_version: { type: "number" },
      reason: { type: "string" },
      evidence_id: { type: "string" },
      occurred_at: { type: "string" },
    },
    required: ["party_id", "date_id", "expected_version", "reason", "evidence_id", "occurred_at"],
    additionalProperties: false,
  };
  if (action === "refresh") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      now: { type: "string" },
      horizon_days: { type: "number" },
    },
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { party_id: { type: "string" }, now: { type: "string" } },
    required: ["party_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { now: { type: "string" }, through_days: { type: "number" }, limit: { type: "number" } },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryImportantDateStewardshipCapability(action = "listUpcoming") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_IMPORTANT_DATE_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_important_date_stewardship",
    action,
    name: `Executive Secretary important date stewardship ${action}`,
    document: "secretary_important_date",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_important_date_stewardship.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "relationship", "important-date", "reminder", "evidence", config.mode],
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

export default createSecretaryImportantDateStewardshipCapability;
