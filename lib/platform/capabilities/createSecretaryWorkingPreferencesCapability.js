import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  correctSecretaryWorkingPreference,
  readSecretaryWorkingPreferences,
  recordSecretaryWorkingPreference,
  retractSecretaryWorkingPreference,
} from "@/lib/operator/secretary/SecretaryWorkingPreferencesRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  read: {
    mode: "read",
    aliases: [
      "show my working preferences",
      "what preferences does the secretary remember",
      "show executive preferences",
    ],
    description: "Read explicit evidence-backed executive working preferences and their optional history. Preferences are advisory defaults only, are never inferred, and never grant approval, payment, signing, booking, or binding authority. Explicit current instructions override stored preferences.",
    execute: readSecretaryWorkingPreferences,
  },
  record: {
    mode: "write",
    aliases: [
      "remember this working preference",
      "remember I prefer",
      "save this meeting travel or calendar preference",
    ],
    description: "Record one explicit evidence-backed executive working preference. Sensitive credential or authority-bearing preference keys are rejected. Existing values require the correction lifecycle rather than silent overwrite.",
    execute: recordSecretaryWorkingPreference,
  },
  correct: {
    mode: "write",
    aliases: [
      "correct my working preference",
      "change that preference with evidence",
      "update this executive preference",
    ],
    description: "Correct one existing executive working preference with explicit evidence while preserving the superseded value and correction history. Optional supersession identity prevents stale corrections.",
    execute: correctSecretaryWorkingPreference,
  },
  retract: {
    mode: "write",
    aliases: [
      "forget this working preference",
      "retract that preference",
      "remove this executive preference",
    ],
    description: "Retract one current executive working preference with explicit evidence while preserving history. Canonical calendar defaults fall back safely; retraction does not create any external authority.",
    execute: retractSecretaryWorkingPreference,
  },
});

function commonPreferenceSchema({ includeValue = true } = {}) {
  const properties = {
    domain: { type: "string", enum: ["CALENDAR", "MEETING", "COMMUNICATION", "TRAVEL", "ROUTINE", "GENERAL"] },
    key: { type: "string" },
    evidence_id: { type: "string" },
    source_kind: { type: "string", enum: ["USER_STATEMENT", "MESSAGE", "CALL", "MEETING", "DOCUMENT", "MANUAL"] },
    source_id: { type: "string" },
    evidence_excerpt: { type: "string" },
    supersedes_entry_id: { type: "string" },
  };
  if (includeValue) properties.value = {};
  return properties;
}

function schema(action) {
  if (action === "read") {
    return {
      type: "object",
      properties: {
        domain: { type: "string", enum: ["CALENDAR", "MEETING", "COMMUNICATION", "TRAVEL", "ROUTINE", "GENERAL"] },
        include_history: { type: "boolean" },
      },
      additionalProperties: false,
    };
  }
  if (action === "record") {
    return {
      type: "object",
      properties: commonPreferenceSchema(),
      required: ["domain", "key", "value", "evidence_id"],
      additionalProperties: false,
    };
  }
  if (action === "correct") {
    return {
      type: "object",
      properties: commonPreferenceSchema(),
      required: ["domain", "key", "value", "evidence_id"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: commonPreferenceSchema({ includeValue: false }),
    required: ["domain", "key", "evidence_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryWorkingPreferencesCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_WORKING_PREFERENCE_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_working_preferences",
    action,
    name: `Executive Secretary working preferences ${action}`,
    document: "secretary_working_preferences",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_working_preferences.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "preferences", "calendar", "meeting", "travel", "evidence", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: true,
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

export default createSecretaryWorkingPreferencesCapability;
