import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryDirectiveFollowThrough,
  completeSecretaryDirectiveFollowThrough,
  listSecretaryDirectiveFollowThrough,
  readSecretaryDirectiveFollowThrough,
  recordSecretaryDirectiveAcknowledgement,
  recordSecretaryDirectiveProgress,
  refreshSecretaryDirectiveFollowThrough,
  startSecretaryDirectiveFollowThrough,
} from "@/lib/operator/secretary/SecretaryDirectiveFollowThroughRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    aliases: ["follow through on this directive", "track this instruction with the target", "secretary manage this directive"],
    description: "Start governed Secretary follow-through for a current executive directive with an explicit target party. The directive ledger stays evidence-only. Delivery, acknowledgment chase and progress checks require explicit follow-through evidence and schedules; high-authority instructions are forced to review rather than auto-send.",
    execute: startSecretaryDirectiveFollowThrough,
  },
  read: {
    mode: "read",
    aliases: ["show directive follow through", "show instruction follow up", "what happened with this directive"],
    description: "Read one directive follow-through run, its explicit target responses and progress evidence, pending follow-ups and linked execution status without inferring acceptance, commitment or completion.",
    execute: readSecretaryDirectiveFollowThrough,
  },
  list: {
    mode: "read",
    aliases: ["show directive follow throughs", "show instructions being followed up", "what directives is the secretary chasing"],
    description: "List organization-scoped executive directives with Secretary follow-through coordination and evidence-backed run state.",
    execute: listSecretaryDirectiveFollowThrough,
  },
  recordAcknowledgement: {
    mode: "write",
    aliases: ["record directive acknowledgement", "record the target response to this instruction", "they acknowledged the directive"],
    description: "Record explicit target response evidence for a directive. Acknowledgment means only evidenced receipt or understanding; it is never acceptance, a commitment or completion.",
    execute: recordSecretaryDirectiveAcknowledgement,
  },
  recordProgress: {
    mode: "write",
    aliases: ["record directive progress", "update progress on this instruction", "record this directive status update"],
    description: "Record explicit factual progress evidence for a directive without inferring performance, delay cause, acceptance, commitment or completion.",
    execute: recordSecretaryDirectiveProgress,
  },
  complete: {
    mode: "write",
    aliases: ["complete directive follow through from evidence", "close this instruction with completion evidence", "record this directive completed and close follow up"],
    description: "Submit explicit directive completion evidence to the Directive Register and close follow-through only if the register accepts it. Linked task or job terminal status alone never completes the directive.",
    execute: completeSecretaryDirectiveFollowThrough,
  },
  refresh: {
    mode: "write",
    aliases: ["refresh directive follow through", "repair instruction follow ups", "check this directive follow through"],
    description: "Repair deterministic follow-ups, fence superseded or terminal directive versions and request completion evidence when linked execution is terminal. Completion is never inferred.",
    execute: refreshSecretaryDirectiveFollowThrough,
  },
  cancel: {
    mode: "write",
    aliases: ["stop following up this directive", "cancel directive follow through", "stop chasing this instruction"],
    description: "Cancel Secretary follow-through coordination only. This does not cancel, withdraw, supersede or complete the executive directive itself.",
    execute: cancelSecretaryDirectiveFollowThrough,
  },
});

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      started_at: { type: "string" },
      delivery_mode: { type: "string", enum: ["TRACK_ONLY", "DELIVER_EXACT"] },
      delivery_at: { type: "string" },
      acknowledgement_due_at: { type: "string" },
      progress_check_at: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id", "started_at"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      run_id: { type: "string" },
    },
    required: ["directive_id"],
    additionalProperties: false,
  };
  if (action === "list") return {
    type: "object",
    properties: { limit: { type: "number" } },
    additionalProperties: false,
  };
  if (action === "recordAcknowledgement") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      responded_at: { type: "string" },
      response_kind: { type: "string", enum: ["ACKNOWLEDGED", "NEEDS_CLARIFICATION", "DECLINED"] },
      response_text: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id", "responded_at", "response_kind"],
    additionalProperties: false,
  };
  if (action === "recordProgress") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      recorded_at: { type: "string" },
      status_text: { type: "string" },
      blockers: { type: "string" },
      expected_completion_at: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id", "recorded_at", "status_text"],
    additionalProperties: false,
  };
  if (action === "complete") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      completed_at: { type: "string" },
      source_reference: { type: "string" },
      result: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id", "completed_at"],
    additionalProperties: false,
  };
  if (action === "refresh") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      refreshed_at: { type: "string" },
    },
    required: ["directive_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      evidence_id: { type: "string" },
      cancelled_at: { type: "string" },
      reason: { type: "string" },
    },
    required: ["directive_id", "evidence_id", "cancelled_at"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryDirectiveFollowThroughCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_directive_follow_through",
    action,
    name: `Executive Secretary directive follow-through ${action}`,
    document: "secretary_directive_follow_through",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_directive_follow_through.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "directives", "follow-through", "acknowledgement", "evidence", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode === "write",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: action === "start" || action === "complete" ? "medium" : "low",
    reversible: action !== "complete",
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

export default createSecretaryDirectiveFollowThroughCapability;
