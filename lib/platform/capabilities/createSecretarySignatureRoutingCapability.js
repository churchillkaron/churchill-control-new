import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretarySignatureRouting,
  listSecretarySignatureRouting,
  readSecretarySignatureRouting,
  recordSecretarySignatureDecline,
  recordSecretarySignatureEvidence,
  refreshSecretarySignatureRouting,
  scheduleSecretarySignatureReminder,
  startSecretarySignatureRouting,
} from "@/lib/operator/secretary/SecretarySignatureRoutingRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  start: {
    mode: "write",
    aliases: ["route document for signature", "collect signatures", "coordinate signatures", "send signature request"],
    description: "Register and coordinate an evidence-backed signature collection package with explicit signers and parallel or sequential routing. Avantiqo does not sign, accept terms, or assert legal validity.",
    execute: startSecretarySignatureRouting,
  },
  recordSignature: {
    mode: "write",
    aliases: ["record signature", "mark signer signed", "record signed document evidence"],
    description: "Record explicit evidence that a designated signer signed. This records evidence only and does not infer signer identity verification, consent, signature validity, legal effect, or authority.",
    execute: recordSecretarySignatureEvidence,
  },
  recordDecline: {
    mode: "write",
    aliases: ["record signature decline", "signer declined", "record declined signature request"],
    description: "Record explicit evidence that a designated signer declined. This does not infer motive, terminate an agreement, or create legal effect.",
    execute: recordSecretarySignatureDecline,
  },
  remind: {
    mode: "write",
    aliases: ["remind signer", "chase signature", "schedule signature reminder"],
    description: "Schedule a bounded factual reminder for a pending current signer without implying consent or signature completion.",
    execute: scheduleSecretarySignatureReminder,
  },
  refresh: {
    mode: "write",
    aliases: ["refresh signature routing", "check signature deadline", "expire signature collection"],
    description: "Refresh the collection against its explicit coordination deadline. Passing that deadline closes only the Secretary routing; it does not infer any legal expiry or document effect.",
    execute: refreshSecretarySignatureRouting,
  },
  cancel: {
    mode: "write",
    aliases: ["cancel signature routing", "stop signature collection", "cancel signature chase"],
    description: "Cancel only Avantiqo's signature coordination record. This does not revoke signatures, withdraw documents, terminate agreements, or alter any external signing platform.",
    execute: cancelSecretarySignatureRouting,
  },
  read: {
    mode: "read",
    aliases: ["show signature routing", "read signature package", "signature collection status"],
    description: "Read one signature routing package with signer states, explicit evidence history, routing mode, and current coordination status.",
    execute: readSecretarySignatureRouting,
  },
  list: {
    mode: "read",
    aliases: ["list signature requests", "show pending signatures", "show signature routing packages"],
    description: "List active signature routing packages for the executive by default, optionally including terminal records.",
    execute: listSecretarySignatureRouting,
  },
});

function schema(action) {
  if (action === "start") return {
    type: "object",
    properties: {
      title: { type: "string" },
      document_reference: { type: "string" },
      routing_mode: { type: "string", enum: ["PARALLEL", "SEQUENTIAL"] },
      signers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            party_id: { type: "string" },
            role: { type: "string" },
            order: { type: "number" },
            required: { type: "boolean" },
          },
          required: ["party_id"],
          additionalProperties: false,
        },
      },
      evidence_id: { type: "string" },
      created_at: { type: "string" },
      collection_deadline_at: { type: "string" },
      initial_request_at: { type: "string" },
      entity_id: { type: "string" },
      priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    },
    required: ["title", "document_reference", "signers", "evidence_id", "created_at"],
    additionalProperties: false,
  };
  if (action === "recordSignature") return {
    type: "object",
    properties: { request_id: { type: "string" }, signer_party_id: { type: "string" }, evidence_id: { type: "string" }, signed_at: { type: "string" } },
    required: ["request_id", "signer_party_id", "evidence_id", "signed_at"],
    additionalProperties: false,
  };
  if (action === "recordDecline") return {
    type: "object",
    properties: { request_id: { type: "string" }, signer_party_id: { type: "string" }, evidence_id: { type: "string" }, declined_at: { type: "string" }, reason: { type: "string" } },
    required: ["request_id", "signer_party_id", "evidence_id", "declined_at"],
    additionalProperties: false,
  };
  if (action === "remind") return {
    type: "object",
    properties: { request_id: { type: "string" }, signer_party_id: { type: "string" }, evidence_id: { type: "string" }, reminder_at: { type: "string" }, remind_at: { type: "string" } },
    required: ["request_id", "signer_party_id", "evidence_id", "remind_at"],
    additionalProperties: false,
  };
  if (action === "refresh") return {
    type: "object",
    properties: { request_id: { type: "string" }, as_of: { type: "string" } },
    required: ["request_id", "as_of"],
    additionalProperties: false,
  };
  if (action === "cancel") return {
    type: "object",
    properties: { request_id: { type: "string" }, evidence_id: { type: "string" }, cancelled_at: { type: "string" }, reason: { type: "string" } },
    required: ["request_id", "evidence_id", "cancelled_at"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: { request_id: { type: "string" } },
    required: ["request_id"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { include_terminal: { type: "boolean" }, limit: { type: "number" } },
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretarySignatureRoutingCapability(action = "list") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_SIGNATURE_ROUTING_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_signature_routing",
    action,
    name: `Executive Secretary signature routing ${action}`,
    document: "secretary_signature_routing",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_signature_routing.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "signature", "documents", "routing", "follow-through", config.mode],
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

export default createSecretarySignatureRoutingCapability;
