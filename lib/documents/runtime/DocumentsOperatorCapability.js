import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { createControlledDocument, createControlledDocumentPack } from "@/lib/documents/runtime/DocumentControlRuntime";
import { splitPdfPages, validateDistinctPdfObjectSpans } from "@/lib/documents/runtime/PdfPageSplitRuntime";
import { loadConversationAttachmentSet } from "@/lib/platform/runtime/ConversationAttachmentRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function actorContext(context = {}) {
  const actor = context.actor || {};
  return {
    id: actor.id || null,
    staffId: actor.staffId || actor.staff_id || actor.staffAccountId || actor.staff_account_id || null,
  };
}

export function createDocumentsFileCreateCapability() {
  const manifest = defineCapability({
    domain: "documents",
    capability: "files",
    action: "create",
    description: "Create a controlled document from a scoped Business Partner attachment using the canonical Documents runtime.",
    permissions: [],
    events: ["documents.files.created"],
    tags: ["documents", "files", "attachment", "controlled-document"],
    transactional: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    risk: "medium",
    contextScope: "organization",
    inputSchema: {
      type: "object",
      required: ["attachment_set_id", "file_id"],
      properties: {
        attachment_set_id: { type: "string" }, file_id: { type: "string" },
        document_name: { type: "string" }, document_type: { type: "string" },
        document_number: { type: "string" }, classification: { type: "string" },
        reference_type: { type: "string" }, reference_id: { type: "string" },
      },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("DOCUMENT_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({
      organizationId: context.organizationId,
      request: context.callerRequest,
    });
    if (!access.success) {
      const error = new Error(access.error || "DOCUMENT_ORGANIZATION_ACCESS_REQUIRED");
      error.status = access.status || 403;
      throw error;
    }
    if (text(access.user?.id, 160) !== text(context.actor?.id, 160)) {
      const error = new Error("DOCUMENT_EXECUTION_ACTOR_MISMATCH");
      error.status = 403;
      throw error;
    }
    const setId = text(payload.attachment_set_id, 80);
    const fileId = text(payload.file_id, 80);
    if (!setId || !fileId) throw new Error("DOCUMENT_ATTACHMENT_REFERENCE_REQUIRED");
    const actor = actorContext(context);
    const loaded = await loadConversationAttachmentSet({
      context: { organizationId: context.organizationId, actor },
      attachment_set_id: setId,
    });
    if (loaded.expired) throw new Error("DOCUMENT_ATTACHMENT_SET_EXPIRED");
    const source = (loaded.files || []).find((file) => text(file.id, 80) === fileId);
    if (!source?.url) throw new Error("DOCUMENT_ATTACHMENT_NOT_FOUND");
    const response = await fetch(source.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`DOCUMENT_ATTACHMENT_DOWNLOAD_FAILED:${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = {
      name: source.name || "document",
      type: source.mime_type || "application/octet-stream",
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    };
    const document = await createControlledDocument({
      organizationId: context.organizationId,
      entityId: context.entityId || null,
      actor: { staffId: actor.staffId },
      file,
      documentName: text(payload.document_name, 500) || source.name,
      documentType: text(payload.document_type, 120) || "FILE",
      documentNumber: text(payload.document_number, 160) || null,
      classification: text(payload.classification, 32) || "INTERNAL",
      referenceType: text(payload.reference_type, 160) || null,
      referenceId: text(payload.reference_id, 160) || null,
      metadata: {
        upload_source: "business_partner",
        attachment_set_id: setId,
        attachment_file_id: fileId,
        attachment_sha256: source.sha256 || null,
        authorization_effect: "NONE",
      },
    });
    return { success: true, document, source_attachment_sha256: source.sha256 || null };
  }
  return { manifest, execute };
}

export function createDocumentsFilePackCreateCapability() {
  const manifest = defineCapability({
    domain: "documents",
    capability: "files",
    action: "createPack",
    description: "Split one scoped Business Partner PDF into distinct logical page groups and create all controlled documents as one governed pack.",
    permissions: [],
    events: ["documents.files.pack_created"],
    tags: ["documents", "files", "attachment", "pdf", "split", "controlled-document"],
    transactional: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    risk: "medium",
    contextScope: "organization",
    inputSchema: {
      type: "object",
      required: ["attachment_set_id", "file_id", "objects"],
      properties: {
        attachment_set_id: { type: "string" },
        file_id: { type: "string" },
        objects: { type: "array", minItems: 2, maxItems: 20, items: {
          type: "object",
          required: ["page_numbers"],
          properties: {
            logical_object_id: { type: "string" }, page_numbers: { type: "array", minItems: 1, items: { type: "integer", minimum: 1 } },
            document_name: { type: "string" }, document_type: { type: "string" }, document_number: { type: "string" }, classification: { type: "string" },
            reference_type: { type: "string" }, reference_id: { type: "string" },
          }, additionalProperties: false,
        } },
      },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("DOCUMENT_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "DOCUMENT_ORGANIZATION_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id, 160) !== text(context.actor?.id, 160)) { const error = new Error("DOCUMENT_EXECUTION_ACTOR_MISMATCH"); error.status = 403; throw error; }

    const setId = text(payload.attachment_set_id, 80);
    const fileId = text(payload.file_id, 80);
    if (!setId || !fileId) throw new Error("DOCUMENT_ATTACHMENT_REFERENCE_REQUIRED");
    const objects = validateDistinctPdfObjectSpans(payload.objects);
    const actor = actorContext(context);
    const loaded = await loadConversationAttachmentSet({ context: { organizationId: context.organizationId, actor }, attachment_set_id: setId });
    if (loaded.expired) throw new Error("DOCUMENT_ATTACHMENT_SET_EXPIRED");
    const source = (loaded.files || []).find((file) => text(file.id, 80) === fileId);
    if (!source?.url) throw new Error("DOCUMENT_ATTACHMENT_NOT_FOUND");
    if (text(source.mime_type, 160).toLowerCase() !== "application/pdf") throw new Error("DOCUMENT_PACK_SOURCE_MUST_BE_PDF");
    const response = await fetch(source.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`DOCUMENT_ATTACHMENT_DOWNLOAD_FAILED:${response.status}`);
    const sourceBytes = Buffer.from(await response.arrayBuffer());

    const documents = [];
    for (const item of objects) {
      const split = await splitPdfPages({ bytes: sourceBytes, pageNumbers: item.page_numbers, filename: source.name });
      const splitBytes = split.bytes;
      documents.push({
        file: { name: split.filename, type: "application/pdf", async arrayBuffer() { return splitBytes.buffer.slice(splitBytes.byteOffset, splitBytes.byteOffset + splitBytes.byteLength); } },
        documentName: text(item.document_name, 500) || `${source.name} · ${text(item.logical_object_id, 120) || item.page_numbers.join("-")}`,
        documentType: text(item.document_type, 120) || "FILE",
        documentNumber: text(item.document_number, 160) || null,
        classification: text(item.classification, 32) || "INTERNAL",
        referenceType: text(item.reference_type, 160) || null,
        referenceId: text(item.reference_id, 160) || null,
        metadata: {
          upload_source: "business_partner", attachment_set_id: setId, attachment_file_id: fileId,
          source_attachment_sha256: source.sha256 || null, logical_object_id: text(item.logical_object_id, 120) || null,
          source_page_numbers: split.page_numbers, source_page_count: split.source_page_count, authorization_effect: "NONE",
        },
      });
    }

    const pack = await createControlledDocumentPack({ organizationId: context.organizationId, entityId: context.entityId || null, actor: { staffId: actor.staffId }, documents });
    return { success: true, pack, source_attachment_sha256: source.sha256 || null };
  }

  return { manifest, execute };
}

export default createDocumentsFileCreateCapability;
