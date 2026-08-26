import { defineCapability } from "./defineCapability";
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

const BASE = Object.freeze({
  contextScope: "organization",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  riskLevel: "low",
  audit: true,
});

export function createSecretaryDocumentFilingCapability(action = "register") {
  const handlers = {
    register: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "register",
      title: "Register Secretary document",
      description: "Register a document reference or missing-document requirement in the Secretary's durable filing index without creating a file vault or implying legal review, signature, acceptance, submission, or approval.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_key"],
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
          collection_deadline: { type: "string" },
          expected_missing: { type: "boolean" },
        },
      },
      execute: registerSecretaryDocumentFile,
    }),
    fileVersion: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "fileVersion",
      title: "File Secretary document version",
      description: "Record an explicitly evidenced source reference as the current document version, preserving superseded versions and canonical filing metadata. Filing never implies review, signature, legal acceptance, submission, or approval.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_id", "evidence_id", "source_reference", "original_filename"],
        properties: {
          document_id: { type: "string" },
          evidence_id: { type: "string" },
          source_reference: { type: "string" },
          original_filename: { type: "string" },
          received_from_party_id: { type: "string" },
          received_at: { type: "string" },
          checksum_reference: { type: "string" },
          notes: { type: "string" },
        },
      },
      execute: fileSecretaryDocumentVersion,
    }),
    recordUnavailable: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "recordUnavailable",
      title: "Record unavailable document",
      description: "Record explicit evidence that a requested document is unavailable, preserving the exception rather than inventing receipt, waiver, review, or approval.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_id", "evidence_id", "reason"],
        properties: {
          document_id: { type: "string" },
          evidence_id: { type: "string" },
          reason: { type: "string" },
        },
      },
      execute: recordSecretaryDocumentUnavailable,
    }),
    reclassify: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "reclassify",
      title: "Reclassify Secretary document",
      description: "Change explicit filing metadata while preserving classification history and the original source reference.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_id", "reason"],
        properties: {
          document_id: { type: "string" },
          reason: { type: "string" },
          filing_folder: { type: "string" },
          category: { type: "string" },
          naming_base: { type: "string" },
          document_type: { type: "string" },
        },
      },
      execute: reclassifySecretaryDocumentFile,
    }),
    reconcileCurrentName: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "reconcileCurrentName",
      title: "Reconcile current document name",
      description: "Recompute the canonical name and filing path for the current indexed version after an explicit classification change, preserving source reference and naming history.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_id", "reason"],
        properties: {
          document_id: { type: "string" },
          reason: { type: "string" },
        },
      },
      execute: reconcileSecretaryDocumentCurrentName,
    }),
    read: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "read",
      title: "Read Secretary document register",
      description: "Read one durable Secretary document register entry with versions, filing metadata, missing-document evidence, and follow-up state.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        properties: {
          document_id: { type: "string" },
          document_key: { type: "string" },
        },
      },
      execute: readSecretaryDocumentFile,
    }),
    list: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "list",
      title: "List Secretary documents",
      description: "Search the Secretary's organization-scoped document index by title/reference/classification without claiming access to file contents that are not explicitly referenced.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          document_type: { type: "string" },
          document_status: { type: "string" },
          limit: { type: "number" },
        },
      },
      execute: listSecretaryDocumentFiles,
    }),
    cancel: defineCapability({
      ...BASE,
      capability: "secretary_document_filing",
      action: "cancel",
      title: "Cancel Secretary document filing coordination",
      description: "Cancel Secretary follow-through for a document register entry while preserving all file references and version history; no source document is deleted.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["document_id"],
        properties: {
          document_id: { type: "string" },
          reason: { type: "string" },
        },
      },
      execute: cancelSecretaryDocumentFile,
    }),
  };
  if (!handlers[action]) throw new Error(`SECRETARY_DOCUMENT_FILING_ACTION_UNSUPPORTED:${action}`);
  return handlers[action];
}

export default createSecretaryDocumentFilingCapability;
