import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  cancelSecretaryDocumentPreparation,
  finalizeSecretaryDocumentPreparation,
  listSecretaryDocumentPreparations,
  prepareSecretaryDocument,
  readSecretaryDocumentPreparation,
  reviseSecretaryDocumentPreparation,
} from "@/lib/operator/secretary/SecretaryDocumentPreparationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const ACTIONS = Object.freeze({
  prepare: {
    mode: "write",
    risk: "medium",
    description: "Create a controlled Secretary-prepared document version from explicit source text while preserving the original source and recording the exact prepared text.",
    aliases: ["proofread this document", "format this document", "polish this memo", "prepare this letter", "clean up this report"],
    execute: prepareSecretaryDocument,
  },
  revise: {
    mode: "write",
    risk: "medium",
    description: "Record an explicitly supplied revised prepared version while preserving all earlier prepared versions and the original source text.",
    aliases: ["revise the prepared document", "update the proofreading", "change the formatted version", "correct the prepared copy"],
    execute: reviseSecretaryDocumentPreparation,
  },
  finalize: {
    mode: "write",
    risk: "medium",
    description: "Mark the exact prepared text as the final internal copy only; this does not send, publish, file, sign, submit or approve the document.",
    aliases: ["finalize the prepared document", "mark this copy final", "finish proofreading", "finalize the memo copy"],
    execute: finalizeSecretaryDocumentPreparation,
  },
  cancel: {
    mode: "write",
    risk: "low",
    description: "Cancel only the Secretary document-preparation record without altering source material or any external document.",
    aliases: ["cancel document preparation", "discard the prepared version", "stop proofreading this document"],
    execute: cancelSecretaryDocumentPreparation,
  },
  read: {
    mode: "read",
    risk: "low",
    description: "Read one Secretary document-preparation record including source, current prepared text, revision history and safety boundaries.",
    aliases: ["show prepared document", "show proofreading record", "read prepared copy", "show document preparation history"],
    execute: readSecretaryDocumentPreparation,
  },
  list: {
    mode: "read",
    risk: "low",
    description: "List Secretary document-preparation records for the organization.",
    aliases: ["list prepared documents", "show proofreading jobs", "show document preparations"],
    execute: listSecretaryDocumentPreparations,
  },
});

function schemaFor(action) {
  const common = {
    preparation_id: { type: "string" },
    evidence_id: { type: "string" },
    expected_version: { type: "number" },
  };
  switch (action) {
    case "prepare":
      return {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["GENERAL_DOCUMENT", "LETTER", "MEMO", "REPORT", "BRIEFING", "EMAIL_DRAFT", "AGENDA_SUPPORT", "OTHER"] },
          title: { type: "string" },
          source_text: { type: "string" },
          prepared_text: { type: "string" },
          change_scope: { type: "string", enum: ["PROOFREAD_ONLY", "FORMAT_ONLY", "PROOFREAD_AND_FORMAT", "POLISH_PRESERVE_MEANING", "RESTRUCTURE_PRESERVE_MEANING"] },
          change_summary: { type: "string" },
          instruction: { type: "string" },
          source_reference: { type: "string" },
          evidence_id: { type: "string" },
          prepared_at: { type: "string" },
          entity_id: { type: "string" },
        },
        required: ["title", "source_text", "prepared_text", "change_scope", "evidence_id", "prepared_at"],
        additionalProperties: false,
      };
    case "revise":
      return {
        type: "object",
        properties: {
          ...common,
          prepared_text: { type: "string" },
          change_scope: { type: "string", enum: ["PROOFREAD_ONLY", "FORMAT_ONLY", "PROOFREAD_AND_FORMAT", "POLISH_PRESERVE_MEANING", "RESTRUCTURE_PRESERVE_MEANING"] },
          change_summary: { type: "string" },
          instruction: { type: "string" },
          revised_at: { type: "string" },
        },
        required: ["preparation_id", "prepared_text", "change_scope", "evidence_id", "revised_at", "expected_version"],
        additionalProperties: false,
      };
    case "finalize":
      return {
        type: "object",
        properties: { ...common, finalized_at: { type: "string" } },
        required: ["preparation_id", "evidence_id", "finalized_at", "expected_version"],
        additionalProperties: false,
      };
    case "cancel":
      return {
        type: "object",
        properties: { ...common, cancelled_at: { type: "string" }, reason: { type: "string" } },
        required: ["preparation_id", "evidence_id", "cancelled_at", "reason", "expected_version"],
        additionalProperties: false,
      };
    case "read":
      return { type: "object", properties: { preparation_id: { type: "string" } }, required: ["preparation_id"], additionalProperties: false };
    case "list":
      return { type: "object", properties: { include_cancelled: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
    default:
      return { type: "object", additionalProperties: false };
  }
}

export function createSecretaryDocumentPreparationCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_DOCUMENT_PREPARATION_ACTION_UNSUPPORTED:${text(action, 80)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_document_preparation",
    action,
    name: `Secretary document preparation ${action}`,
    document: "secretary_document_preparation_record",
    description: config.description,
    permissions: [],
    events: [`platform.secretary.document_preparation.${action}`],
    tags: ["platform", "secretary", "document", "proofreading", "preparation", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: config.risk,
    reversible: true,
    approval: { required: false },
    inputSchema: schemaFor(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 120) && text(context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId, 120));
  }

  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryDocumentPreparationCapability;
