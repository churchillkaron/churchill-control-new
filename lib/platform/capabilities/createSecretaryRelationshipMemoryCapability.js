import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  clearSecretaryRelationshipNextTouch,
  correctSecretaryRelationshipFact,
  listSecretaryRelationshipAttention,
  readSecretaryRelationshipMemory,
  recordSecretaryRelationshipFact,
  recordSecretaryRelationshipInteraction,
  retractSecretaryRelationshipFact,
  setSecretaryRelationshipNextTouch,
} from "@/lib/operator/secretary/SecretaryRelationshipMemoryRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  read: {
    mode: "read",
    risk: "low",
    aliases: ["what do we know about this contact", "show relationship memory", "show relationship history"],
    description: "Read evidence-backed Secretary relationship memory, contact preferences, current/stale facts, interaction history, next touch, and recent supporting Secretary records without inventing relationship facts.",
    execute: readSecretaryRelationshipMemory,
  },
  recordFact: {
    mode: "write",
    risk: "low",
    aliases: ["remember this relationship fact", "record this about the contact", "remember this preference"],
    description: "Record an explicit evidence-backed relationship fact. Existing current facts with the same key are superseded but preserved; credentials and secrets are rejected.",
    execute: recordSecretaryRelationshipFact,
  },
  correctFact: {
    mode: "write",
    risk: "low",
    aliases: ["correct this relationship fact", "update this remembered fact with evidence"],
    description: "Correct an existing relationship fact using explicit correction evidence while preserving the original fact and correction history.",
    execute: correctSecretaryRelationshipFact,
  },
  retractFact: {
    mode: "write",
    risk: "low",
    aliases: ["retract this relationship fact", "mark this remembered fact wrong"],
    description: "Retract an existing relationship fact using explicit evidence and reason without deleting the historical record.",
    execute: retractSecretaryRelationshipFact,
  },
  recordInteraction: {
    mode: "write",
    risk: "low",
    aliases: ["record this contact interaction", "remember that we spoke", "log this relationship interaction"],
    description: "Record an explicit evidenced interaction and update last-contact time only from the supplied interaction timestamp.",
    execute: recordSecretaryRelationshipInteraction,
  },
  setNextTouch: {
    mode: "write",
    risk: "low",
    aliases: ["follow up with this contact", "set next relationship touch", "remember to contact them again"],
    description: "Create one deterministic Secretary-owned next-touch follow-up and synchronize the contact profile next-follow-up timestamp.",
    execute: setSecretaryRelationshipNextTouch,
  },
  clearNextTouch: {
    mode: "write",
    risk: "low",
    aliases: ["clear next relationship touch", "stop this relationship follow up"],
    description: "Clear the Secretary relationship next-touch state and cancel only pending follow-ups created by the relationship-memory lifecycle.",
    execute: clearSecretaryRelationshipNextTouch,
  },
  listAttention: {
    mode: "read",
    risk: "low",
    aliases: ["which relationships need attention", "who should I follow up with", "show overdue relationship follow ups"],
    description: "List organization-scoped relationships whose explicitly scheduled next touch is due or approaching, without inventing relationship importance or priority.",
    execute: listSecretaryRelationshipAttention,
  },
});

function locator() {
  return {
    party_id: { type: "string" },
  };
}

function schema(action) {
  if (action === "read") return {
    type: "object",
    properties: { ...locator(), recent_limit: { type: "number" } },
    required: ["party_id"],
    additionalProperties: false,
  };
  if (action === "recordFact") return {
    type: "object",
    properties: {
      ...locator(),
      fact_key: { type: "string" },
      value: {},
      category: { type: "string" },
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
      observed_at: { type: "string" },
      valid_until: { type: "string" },
      notes: { type: "string" },
    },
    required: ["party_id", "fact_key", "value", "evidence_id"],
    additionalProperties: false,
  };
  if (action === "correctFact") return {
    type: "object",
    properties: {
      ...locator(),
      fact_id: { type: "string" },
      value: {},
      evidence_id: { type: "string" },
      reason: { type: "string" },
      source_reference: { type: "string" },
      observed_at: { type: "string" },
      valid_until: { type: "string" },
      notes: { type: "string" },
    },
    required: ["party_id", "fact_id", "value", "evidence_id", "reason"],
    additionalProperties: false,
  };
  if (action === "retractFact") return {
    type: "object",
    properties: { ...locator(), fact_id: { type: "string" }, evidence_id: { type: "string" }, reason: { type: "string" } },
    required: ["party_id", "fact_id", "evidence_id", "reason"],
    additionalProperties: false,
  };
  if (action === "recordInteraction") return {
    type: "object",
    properties: {
      ...locator(),
      evidence_id: { type: "string" },
      occurred_at: { type: "string" },
      kind: { type: "string" },
      channel: { type: "string" },
      direction: { type: "string" },
      summary: { type: "string" },
      source_reference: { type: "string" },
    },
    required: ["party_id", "evidence_id", "occurred_at", "summary"],
    additionalProperties: false,
  };
  if (action === "setNextTouch") return {
    type: "object",
    properties: { ...locator(), due_at: { type: "string" }, reason: { type: "string" } },
    required: ["party_id", "due_at", "reason"],
    additionalProperties: false,
  };
  if (action === "clearNextTouch") return {
    type: "object",
    properties: { ...locator(), reason: { type: "string" } },
    required: ["party_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { now: { type: "string" }, through: { type: "string" }, limit: { type: "number" } },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryRelationshipMemoryCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_RELATIONSHIP_MEMORY_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_relationship_memory",
    action,
    name: `Executive Secretary relationship memory ${action}`,
    document: "secretary_relationship_memory",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_relationship_memory.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "relationship", "contact", "memory", "evidence", config.mode],
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

export default createSecretaryRelationshipMemoryCapability;
