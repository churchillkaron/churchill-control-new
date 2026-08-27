import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { correctSecretaryTravelConfirmation } from "@/lib/operator/secretary/SecretaryTravelConfirmationCorrectionRuntime";
import {
  createSecretaryTravelReminder,
  readSecretaryTravelOperations,
  recordSecretaryTravelConfirmation,
  recordSecretaryTravelDisruption,
} from "@/lib/operator/secretary/SecretaryTravelOperationsRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  read: {
    mode: "read",
    risk: "low",
    aliases: ["show my travel itinerary", "show travel confirmations", "travel operations status"],
    description: "Read an evidence-backed operational itinerary for an existing Secretary travel job, including confirmed travel items, disruptions, reminders, unresolved work and exact approval gates. Researched options are never treated as confirmations.",
    execute: readSecretaryTravelOperations,
  },
  recordConfirmation: {
    mode: "write",
    risk: "low",
    aliases: ["record this travel confirmation", "add confirmed flight", "add confirmed hotel"],
    description: "Record an explicit travel, lodging, transport or meeting confirmation from supplied evidence. This records evidence only and creates no booking, payment or commercial authority.",
    execute: recordSecretaryTravelConfirmation,
  },
  correctConfirmation: {
    mode: "write",
    risk: "low",
    aliases: ["correct this travel confirmation", "fix confirmed flight details", "correct hotel confirmation"],
    description: "Correct one current travel confirmation using explicit correction evidence while preserving the superseded confirmation and correction history. A correction never creates booking, payment or commercial authority.",
    execute: correctSecretaryTravelConfirmation,
  },
  recordDisruption: {
    mode: "write",
    risk: "low",
    aliases: ["record travel disruption", "record flight delay", "record travel change"],
    description: "Record an evidenced travel disruption or change without inferring its impact or accepting any replacement fare, booking, cancellation fee or commercial term.",
    execute: recordSecretaryTravelDisruption,
  },
  createReminder: {
    mode: "write",
    risk: "low",
    aliases: ["remind me about this trip", "add travel reminder", "add check in reminder"],
    description: "Create one deterministic Secretary-owned travel operations reminder from an explicit timestamp. No travel time, check-in time, transfer time or deadline is guessed.",
    execute: createSecretaryTravelReminder,
  },
});

function confirmationProperties() {
  return {
    kind: { type: "string", enum: ["FLIGHT", "TRAIN", "FERRY", "GROUND_TRANSPORT", "HOTEL", "MEETING", "OTHER"] },
    title: { type: "string" },
    confirmation_reference: { type: "string" },
    provider_name: { type: "string" },
    starts_at: { type: "string" },
    ends_at: { type: "string" },
    timezone: { type: "string" },
    origin: { type: "string" },
    destination: { type: "string" },
    location: { type: "string" },
    evidence_id: { type: "string" },
    source_reference: { type: "string" },
    notes: { type: "string" },
  };
}

function schema(action) {
  if (action === "read") return {
    type: "object",
    properties: { job_id: { type: "string" } },
    required: ["job_id"],
    additionalProperties: false,
  };
  if (action === "recordConfirmation") return {
    type: "object",
    properties: { job_id: { type: "string" }, ...confirmationProperties() },
    required: ["job_id", "kind", "confirmation_reference", "evidence_id"],
    additionalProperties: false,
  };
  if (action === "correctConfirmation") return {
    type: "object",
    properties: {
      job_id: { type: "string" },
      supersedes_confirmation_id: { type: "string" },
      reason: { type: "string" },
      ...confirmationProperties(),
    },
    required: ["job_id", "supersedes_confirmation_id", "evidence_id", "reason"],
    additionalProperties: false,
  };
  if (action === "recordDisruption") return {
    type: "object",
    properties: {
      job_id: { type: "string" },
      evidence_id: { type: "string" },
      description: { type: "string" },
      occurred_at: { type: "string" },
      affected_confirmation_id: { type: "string" },
      source_reference: { type: "string" },
    },
    required: ["job_id", "evidence_id", "description"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      job_id: { type: "string" },
      title: { type: "string" },
      details: { type: "string" },
      due_at: { type: "string" },
      remind_at: { type: "string" },
      priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    },
    required: ["job_id", "title", "due_at"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryTravelOperationsCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_TRAVEL_OPERATIONS_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_travel_operations",
    action,
    name: `Executive Secretary travel operations ${action}`,
    document: "secretary_job",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_travel_operations.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "travel", "itinerary", "confirmation", "operations", config.mode],
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

export default createSecretaryTravelOperationsCapability;
