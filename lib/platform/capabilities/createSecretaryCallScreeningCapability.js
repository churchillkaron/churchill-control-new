import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  clearSecretaryContactCallHandling,
  listSecretaryCallScreeningAttention,
  readSecretaryCallScreening,
  readSecretaryContactCallHandling,
  recordSecretaryCallScreeningDisposition,
  screenSecretaryCall,
  setSecretaryContactCallHandling,
} from "@/lib/operator/secretary/SecretaryCallScreeningRuntime";

const ACTIONS = Object.freeze({
  setContactHandling: { mode: "write", aliases: ["set call handling for contact", "mark contact call priority", "set callback rules for contact"], execute: setSecretaryContactCallHandling },
  clearContactHandling: { mode: "write", aliases: ["clear contact call handling", "remove call priority rule"], execute: clearSecretaryContactCallHandling },
  readContactHandling: { mode: "read", aliases: ["show contact call handling", "show caller priority rule"], execute: readSecretaryContactCallHandling },
  screen: { mode: "write", aliases: ["screen this call", "triage inbound call", "decide how to handle this call"], execute: screenSecretaryCall },
  read: { mode: "read", aliases: ["show call screening", "read call triage"], execute: readSecretaryCallScreening },
  listAttention: { mode: "read", aliases: ["calls needing attention", "call screening queue", "urgent calls to review"], execute: listSecretaryCallScreeningAttention },
  recordDisposition: { mode: "write", aliases: ["close call screening", "record call outcome"], execute: recordSecretaryCallScreeningDisposition },
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

function schema(action) {
  if (action === "setContactHandling") return {
    type: "object",
    properties: {
      party_id: { type: "string" },
      tier: { type: "string", enum: ["EXECUTIVE_PRIORITY", "STANDARD", "ROUTINE", "DO_NOT_INTERRUPT"] },
      interrupt_mode: { type: "string", enum: ["ALWAYS", "EXECUTIVE_DECISION_ONLY", "NEVER"] },
      callback_window: { type: "object" },
      notes: { type: "string" },
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
    },
    required: ["party_id", "tier", "interrupt_mode", "evidence_id", "source_reference"],
    additionalProperties: false,
  };
  if (action === "clearContactHandling") return {
    type: "object",
    properties: {
      party_id: { type: "string" }, evidence_id: { type: "string" }, source_reference: { type: "string" }, reason: { type: "string" },
    },
    required: ["party_id", "evidence_id", "source_reference", "reason"],
    additionalProperties: false,
  };
  if (action === "readContactHandling") return {
    type: "object",
    properties: { party_id: { type: "string" } },
    required: ["party_id"],
    additionalProperties: false,
  };
  if (action === "screen") return {
    type: "object",
    properties: {
      call_id: { type: "string" },
      caller_request: { type: "string" },
      caller_stated_urgency: { type: "string", enum: ["EMERGENCY", "URGENT", "TIME_SENSITIVE", "ROUTINE"] },
      executive_decision_required: { type: "boolean" },
      high_authority_request: { type: "boolean" },
      callback_requested: { type: "boolean" },
      callback_due_at: { type: "string" },
      secretary_can_resolve: { type: "boolean" },
      message_only: { type: "boolean" },
      screened_at: { type: "string" },
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
    },
    required: ["call_id", "evidence_id", "source_reference"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { call_id: { type: "string" }, screening_id: { type: "string" } },
    required: ["call_id"],
    additionalProperties: false,
  };
  if (action === "listAttention") return {
    type: "object",
    properties: { route: { type: "string" }, limit: { type: "number" } },
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      call_id: { type: "string" },
      screening_id: { type: "string" },
      disposition: { type: "string", enum: ["SECRETARY_HANDLED", "CALLBACK_COMPLETED", "MESSAGE_RECORDED", "EXECUTIVE_REVIEWED", "REFERRED", "NO_ACTION_REQUIRED", "CALLER_DISCONNECTED"] },
      evidence_id: { type: "string" }, source_reference: { type: "string" }, notes: { type: "string" },
    },
    required: ["call_id", "screening_id", "disposition", "evidence_id", "source_reference"],
    additionalProperties: false,
  };
}

export function createSecretaryCallScreeningCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_CALL_SCREENING_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_call_screening",
    action,
    name: `Executive Secretary call screening ${action}`,
    document: "secretary_call_screening",
    description: "Evidence-based executive call screening and prioritization. Caller-stated urgency is preserved as unverified, contact priority rules require explicit evidence, and no VIP status, emergency, interruption authority, or external authority is inferred.",
    permissions: [],
    events: [`platform.secretary_call_screening.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "calls", "screening", "triage", "priority", config.mode],
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

export default createSecretaryCallScreeningCapability;
