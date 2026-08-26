import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  registerSecretaryDocumentFile,
  fileSecretaryDocumentVersion,
  recordSecretaryDocumentUnavailable,
  reclassifySecretaryDocumentFile,
  reconcileSecretaryDocumentCurrentName,
  readSecretaryDocumentFile,
  listSecretaryDocumentFiles,
  cancelSecretaryDocumentFile,
} from "@/lib/operator/secretary/SecretaryDocumentFilingRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  register: {
    action: "register",
    mode: "write",
    risk: "low",
    aliases: ["file this document", "register this document", "track this missing document"],
    description: "Register a document reference or missing-document requirement in the Secretary's durable filing index without creating a file vault or implying legal review, signature, acceptance, submission, or approval.",
  },
  fileVersion: {
    action: "fileVersion",
    mode: "write",
    risk: "low",
    aliases: ["file this document version", "record this document version", "make this the current document version"],
    description: "Record an explicitly evidenced source reference as the current document version, preserving superseded versions and canonical filing metadata. Filing never implies review, signature, legal acceptance, submission, or approval.",
  },
  recordUnavailable: {
    action: "recordUnavailable",
    mode: "write",
    risk: "low",
    aliases: ["record this document unavailable", "mark this missing document unavailable"],
    description: "Record explicit evidence that a requested document is unavailable, preserving the exception rather than inventing receipt, waiver, review, or approval.",
  },
  reclassify: {
    action: "reclassify",
    mode: "write",
    risk: "low",
    aliases: ["reclassify this document", "move this document in the filing taxonomy"],
    description: "Change explicit filing metadata while preserving classification history and the original source reference.",
  },
  reconcileCurrentName: {
    action: "reconcileCurrentName",
    mode: "write",
    risk: "low",
    aliases: ["rename the current document consistently", "reconcile this document filename"],
    description: "Recompute the canonical name and filing path for the current indexed version after an explicit classification change, preserving source reference and naming history.",
  },
  read: {
    action: "read",
    mode: "read",
    risk: "low",
    aliases: ["show this filed document", "show this document history", "where is this document filed"],
    description: "Read one durable Secretary document register entry with versions, filing metadata, missing-document evidence, and follow-up state.",
  },
  list: {
    action: "list",
    mode: "read",
    risk: "low",
    aliases: ["find my documents", "list filed documents", "search the document register"],
    description: "Search the Secretary's organization-scoped document index by title, reference, or classification without claiming access to file contents that are not explicitly referenced.",
  },
  cancel: {
    action: "cancel",
    mode: "write",
    risk: "low",
    aliases: ["cancel document filing follow-up", "stop chasing this document"],
    description: "Cancel Secretary follow-through for a document register entry while preserving all file references and version history; no source document is deleted.",
  },
});

function locatorProperties() {
  return {
    document_id: { type: "string" },
    document_key: { type: "string" },
    document_reference: { type: "string" },
  };
}

function schema(action) {
  if (action === "register") return {
    type: "object",
    properties: {
      document_key: { type: "string" },
      document_title: { type: "string" },
      document_type: { type: "string" },
      category: { type: "string" },
      subject_reference: { type: "string" },
      responsible_party_id: { type: "string" },
      filing_folder: { type: "string" },
      naming_base: { type: "string" },
      document_date: { type: "string" },
      default_extension: { type: "string" },
      collection_deadline: { type: "string" },
      expected_missing: { type: "boolean" },
      entity_id: { type: "string" },
    },
    required: ["document_key"],
    additionalProperties: false,
  };
  if (action === "fileVersion") return {
    type: "object",
    properties: {
      ...locatorProperties(),
      evidence_id: { type: "string" },
      source_reference: { type: "string" },
      file_reference: { type: "string" },
      original_filename: { type: "string" },
      received_from_party_id: { type: "string" },
      received_at: { type: "string" },
      checksum_reference: { type: "string" },
      notes: { type: "string" },
    },
    required: ["document_id", "evidence_id", "source_reference", "original_filename"],
    additionalProperties: false,
  };
  if (action === "recordUnavailable") return {
    type: "object",
    properties: { ...locatorProperties(), evidence_id: { type: "string" }, reason: { type: "string" } },
    required: ["document_id", "evidence_id", "reason"],
    additionalProperties: false,
  };
  if (action === "reclassify") return {
    type: "object",
    properties: {
      ...locatorProperties(),
      reason: { type: "string" },
      filing_folder: { type: "string" },
      category: { type: "string" },
      naming_base: { type: "string" },
      document_type: { type: "string" },
    },
    required: ["document_id", "reason"],
    additionalProperties: false,
  };
  if (action === "reconcileCurrentName") return {
    type: "object",
    properties: { ...locatorProperties(), reason: { type: "string" } },
    required: ["document_id", "reason"],
    additionalProperties: false,
  };
  if (action === "read") return {
    type: "object",
    properties: locatorProperties(),
    additionalProperties: false,
  };
  if (action === "list") return {
    type: "object",
    properties: {
      query: { type: "string" },
      category: { type: "string" },
      document_type: { type: "string" },
      document_status: { type: "string" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: { ...locatorProperties(), reason: { type: "string" } },
    required: ["document_id"],
    additionalProperties: false,
  };
}

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

export function createSecretaryDocumentFilingCapability(action = "register") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DOCUMENT_FILING_ACTION_UNSUPPORTED:${text(action, 80)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_document_filing",
    action: config.action,
    name: `Executive Secretary document filing ${action}`,
    document: "secretary_document_filing",
    description: config.description,
    permissions: [],
    events: [`platform.secretary_document_filing.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "document", "filing", "records", "references-only", config.mode],
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
    if (action === "register") return registerSecretaryDocumentFile({ context, payload });
    if (action === "fileVersion") return fileSecretaryDocumentVersion({ context, payload });
    if (action === "recordUnavailable") return recordSecretaryDocumentUnavailable({ context, payload });
    if (action === "reclassify") return reclassifySecretaryDocumentFile({ context, payload });
    if (action === "reconcileCurrentName") return reconcileSecretaryDocumentCurrentName({ context, payload });
    if (action === "read") return readSecretaryDocumentFile({ context, payload });
    if (action === "list") return listSecretaryDocumentFiles({ context, payload });
    if (action === "cancel") return cancelSecretaryDocumentFile({ context, payload });
    throw new Error(`SECRETARY_DOCUMENT_FILING_ACTION_UNSUPPORTED:${text(action, 80)}`);
  }

  return { manifest, authorize, execute };
}

export default createSecretaryDocumentFilingCapability;
