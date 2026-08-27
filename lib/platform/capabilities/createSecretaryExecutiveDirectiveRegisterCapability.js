import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryExecutiveDirective,
  completeSecretaryExecutiveDirective,
  linkSecretaryDirectiveExecution,
  listSecretaryExecutiveDirectives,
  readSecretaryExecutiveDirective,
  recordSecretaryExecutiveDirective,
  supersedeSecretaryExecutiveDirective,
} from "@/lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  record: {
    mode: "write",
    aliases: ["record this directive", "record this executive instruction", "track this instruction"],
    description: "Record explicit evidence of an already-issued executive instruction in the durable directive register. The Secretary records the instruction exactly but does not convert it into a decision, preference, commitment, work assignment, or grant of authority.",
    execute: recordSecretaryExecutiveDirective,
  },
  supersede: {
    mode: "write",
    aliases: ["replace this instruction", "supersede this directive", "record the new instruction instead"],
    description: "Record explicit evidence that a current executive directive was superseded by another already-issued instruction while preserving complete version history and without carrying unstated target, due-date, execution, or authority semantics forward.",
    execute: supersedeSecretaryExecutiveDirective,
  },
  linkExecution: {
    mode: "write",
    aliases: ["link this task to the directive", "connect this job to the instruction", "track execution for this directive"],
    description: "Link existing explicit Secretary task or job execution to a current directive. This creates no work and never infers directive completion from task or job status.",
    execute: linkSecretaryDirectiveExecution,
  },
  complete: {
    mode: "write",
    aliases: ["record this directive complete", "mark this instruction completed from evidence", "record directive completion"],
    description: "Record explicit completion evidence for a current directive. A linked task or job being done is not sufficient by itself and completion is never inferred.",
    execute: completeSecretaryExecutiveDirective,
  },
  cancel: {
    mode: "write",
    aliases: ["cancel this directive", "withdraw this instruction", "record this directive was cancelled"],
    description: "Record explicit evidence that a current executive directive was cancelled or withdrawn. No replacement directive, decision, preference, or authority is inferred.",
    execute: cancelSecretaryExecutiveDirective,
  },
  read: {
    mode: "read",
    aliases: ["show this directive", "read directive history", "show this instruction record"],
    description: "Read one evidence-only executive directive lineage with exact instruction versions, state history, and explicitly linked execution status.",
    execute: readSecretaryExecutiveDirective,
  },
  list: {
    mode: "read",
    aliases: ["show executive directives", "directive register", "what instructions are active"],
    description: "Read the durable organization-wide executive directive register, separated from decisions, preferences, commitments, delegation work, and Secretary jobs.",
    execute: listSecretaryExecutiveDirectives,
  },
});

function schema(action) {
  if (action === "record") return {
    type: "object",
    properties: {
      instruction_text: { type: "string" },
      issuer_party_id: { type: "string" },
      evidence_id: { type: "string" },
      instructed_at: { type: "string" },
      target_party_id: { type: "string" },
      target_text: { type: "string" },
      due_at: { type: "string" },
      source_reference: { type: "string" },
      execution_task_id: { type: "string" },
      execution_job_id: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["instruction_text", "issuer_party_id", "evidence_id", "instructed_at"],
    additionalProperties: false,
  };
  if (action === "supersede") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      supersedes_version_id: { type: "string" },
      replacement_instruction_text: { type: "string" },
      issuer_party_id: { type: "string" },
      evidence_id: { type: "string" },
      instructed_at: { type: "string" },
      target_party_id: { type: "string" },
      target_text: { type: "string" },
      due_at: { type: "string" },
      source_reference: { type: "string" },
      execution_task_id: { type: "string" },
      execution_job_id: { type: "string" },
    },
    required: ["directive_id", "supersedes_version_id", "replacement_instruction_text", "issuer_party_id", "evidence_id", "instructed_at"],
    additionalProperties: false,
  };
  if (action === "linkExecution") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      execution_task_id: { type: "string" },
      execution_job_id: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id"],
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
  if (action === "cancel") return {
    type: "object",
    properties: {
      directive_id: { type: "string" },
      current_version_id: { type: "string" },
      evidence_id: { type: "string" },
      cancelled_at: { type: "string" },
      source_reference: { type: "string" },
      reason: { type: "string" },
    },
    required: ["directive_id", "current_version_id", "evidence_id", "cancelled_at"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { directive_id: { type: "string" } },
    required: ["directive_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { limit: { type: "number" } },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryExecutiveDirectiveRegisterCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DIRECTIVE_REGISTER_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_directive_register",
    action,
    name: `Executive Secretary directive register ${action}`,
    document: "secretary_directive_register",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_directive_register.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "directives", "instructions", "evidence", "governance", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode === "write",
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

export default createSecretaryExecutiveDirectiveRegisterCapability;
