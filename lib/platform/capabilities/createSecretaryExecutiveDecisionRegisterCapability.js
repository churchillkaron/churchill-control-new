import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { supersedeSecretaryExecutiveDecisionGoverned } from "@/lib/operator/secretary/SecretaryExecutiveDecisionRegisterGovernedRuntime";
import {
  linkSecretaryDecisionFollowThrough,
  listSecretaryExecutiveDecisions,
  readSecretaryExecutiveDecision,
  recordSecretaryExecutiveDecision,
  retractSecretaryExecutiveDecision,
  syncSecretaryMeetingDecisions,
} from "@/lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  record: {
    mode: "write",
    aliases: ["record this decision", "add this executive decision", "remember this decision"],
    description: "Record explicit evidence of an already-made executive decision in the durable organization decision register. The Secretary records the decision but does not make, approve or infer it.",
    execute: recordSecretaryExecutiveDecision,
  },
  syncMeeting: {
    mode: "write",
    aliases: ["add this meeting's decisions to the register", "sync meeting decisions", "register the decisions from this meeting"],
    description: "Copy finalized decisions already stored on a completed Secretary meeting into the durable cross-meeting decision register without inventing new decisions or decision timestamps.",
    execute: syncSecretaryMeetingDecisions,
  },
  supersede: {
    mode: "write",
    aliases: ["replace this decision", "supersede this decision", "record the new decision instead"],
    description: "Record explicit evidence that one current executive decision has been superseded by another already-made decision while preserving the complete prior version history.",
    execute: supersedeSecretaryExecutiveDecisionGoverned,
  },
  retract: {
    mode: "write",
    aliases: ["retract this decision", "withdraw this decision", "record that this decision was withdrawn"],
    description: "Record explicit evidence that one current executive decision has been withdrawn. No replacement decision is inferred or created.",
    execute: retractSecretaryExecutiveDecision,
  },
  linkFollowThrough: {
    mode: "write",
    aliases: ["link this task to the decision", "track this task against the decision", "connect follow through to this decision"],
    description: "Link an existing explicit Secretary task to a current decision as follow-through evidence without changing the decision or inferring that the task completes it.",
    execute: linkSecretaryDecisionFollowThrough,
  },
  read: {
    mode: "read",
    aliases: ["show this decision", "read decision history", "show the decision record"],
    description: "Read one evidence-only executive decision lineage with current state, complete version history and any explicitly linked follow-through task.",
    execute: readSecretaryExecutiveDecision,
  },
  list: {
    mode: "read",
    aliases: ["show all executive decisions", "what have we decided", "decision register", "show current decisions"],
    description: "Read the durable organization-wide executive decision register across meetings and direct evidence, including current and retracted lineages without inferring decisions.",
    execute: listSecretaryExecutiveDecisions,
  },
});

function schema(action) {
  if (action === "record") return {
    type: "object",
    properties: {
      decision_text: { type: "string" },
      evidence_id: { type: "string" },
      decided_at: { type: "string" },
      source_reference: { type: "string" },
      decision_owner_party_id: { type: "string" },
      follow_through_task_id: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["decision_text", "evidence_id", "decided_at"],
    additionalProperties: false,
  };
  if (action === "syncMeeting") return {
    type: "object",
    properties: { meeting_id: { type: "string" } },
    required: ["meeting_id"],
    additionalProperties: false,
  };
  if (action === "supersede") return {
    type: "object",
    properties: {
      decision_id: { type: "string" },
      supersedes_version_id: { type: "string" },
      replacement_decision_text: { type: "string" },
      evidence_id: { type: "string" },
      decided_at: { type: "string" },
      source_reference: { type: "string" },
      decision_owner_party_id: { type: "string" },
      follow_through_task_id: { type: "string" },
    },
    required: ["decision_id", "supersedes_version_id", "replacement_decision_text", "evidence_id", "decided_at"],
    additionalProperties: false,
  };
  if (action === "retract") return {
    type: "object",
    properties: {
      decision_id: { type: "string" },
      retracts_version_id: { type: "string" },
      evidence_id: { type: "string" },
      retracted_at: { type: "string" },
      source_reference: { type: "string" },
      reason: { type: "string" },
    },
    required: ["decision_id", "retracts_version_id", "evidence_id", "retracted_at"],
    additionalProperties: false,
  };
  if (action === "linkFollowThrough") return {
    type: "object",
    properties: {
      decision_id: { type: "string" },
      current_version_id: { type: "string" },
      follow_through_task_id: { type: "string" },
      evidence_id: { type: "string" },
    },
    required: ["decision_id", "current_version_id", "follow_through_task_id", "evidence_id"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { decision_id: { type: "string" } },
    required: ["decision_id"],
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

export function createSecretaryExecutiveDecisionRegisterCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DECISION_REGISTER_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_decision_register",
    action,
    name: `Executive Secretary decision register ${action}`,
    document: "secretary_decision_register",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_decision_register.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "decisions", "evidence", "governance", config.mode],
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

export default createSecretaryExecutiveDecisionRegisterCapability;
