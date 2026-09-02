import { createHash, randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DOCUMENT_BUCKET = "documents";
const CLASSIFICATIONS = new Set(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
const SIGNATURE_STATUSES = new Set(["PENDING", "SENT", "VIEWED", "SIGNED", "DECLINED", "EXPIRED", "CANCELLED"]);
const RETENTION_ACTIONS = new Set(["REVIEW", "ARCHIVE", "DELETE"]);
const DISPOSITION_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "CANCELLED"]);

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function optionalText(value, limit = 4000) {
  return clean(value, limit) || null;
}

function cleanDate(value, field) {
  const text = optionalText(value, 32);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must use YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${field} is invalid`);
  }
  return text;
}

function cleanTimestamp(value, field) {
  const text = optionalText(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw new Error(`${field} is invalid`);
  return new Date(parsed).toISOString();
}

function cleanClassification(value) {
  const classification = clean(value || "INTERNAL", 32).toUpperCase();
  if (!CLASSIFICATIONS.has(classification)) {
    throw new Error("classification must be PUBLIC, INTERNAL, CONFIDENTIAL or RESTRICTED");
  }
  return classification;
}

function cleanTags(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(values.map((entry) => clean(entry, 80)).filter(Boolean))].slice(0, 50);
}

function metadataObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeName(value) {
  const name = clean(value || "document", 240)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return name || "document";
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function storagePath({ organizationId, entityId, documentId, version, filename }) {
  const scope = entityId ? `entity-${entityId}` : "organization";
  return `${organizationId}/${scope}/${documentId}/v${version}/${safeName(filename)}`;
}

function actorId(actor) {
  return actor?.staff?.id || actor?.staffId || actor?.staff_id || null;
}

async function ensureDocument({ organizationId, documentId }) {
  const { data, error } = await supabaseAdmin
    .from("enterprise_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error("Controlled document not found");
    notFound.status = 404;
    throw notFound;
  }
  return data;
}

async function uploadPrivateFile({ path, buffer, mimeType }) {
  const { error } = await supabaseAdmin.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType || "application/octet-stream",
      upsert: false,
    });
  if (error) throw error;
}

async function removePrivateFile(path) {
  if (!path) return;
  try {
    await supabaseAdmin.storage.from(DOCUMENT_BUCKET).remove([path]);
  } catch {
    // Best-effort orphan cleanup after a failed database mutation.
  }
}

export async function createControlledDocument({
  organizationId,
  entityId = null,
  actor = null,
  file,
  documentName = null,
  documentType = "FILE",
  documentNumber = null,
  classification = "INTERNAL",
  ownerStaffId = null,
  effectiveDate = null,
  expiryDate = null,
  reviewDueAt = null,
  retentionUntil = null,
  referenceType = null,
  referenceId = null,
  sourceOrganizationDocumentId = null,
  tags = [],
  metadata = {},
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("file required");

  const documentId = randomUUID();
  const filename = safeName(file.name || documentName || "document");
  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = sha256(buffer);
  const mimeType = optionalText(file.type, 200) || "application/octet-stream";
  const path = storagePath({
    organizationId,
    entityId,
    documentId,
    version: 1,
    filename,
  });
  const actorStaffId = actorId(actor);

  await uploadPrivateFile({ path, buffer, mimeType });

  try {
    const rpc = await supabaseAdmin.rpc("create_enterprise_document_atomic", {
      p_id: documentId,
      p_organization_id: organizationId,
      p_entity_id: entityId || null,
      p_document_type: clean(documentType || "FILE", 120).toUpperCase(),
      p_document_name: clean(documentName || file.name || "Document", 500),
      p_document_number: optionalText(documentNumber, 160),
      p_classification: cleanClassification(classification),
      p_storage_path: path,
      p_file_size_bytes: buffer.length,
      p_mime_type: mimeType,
      p_checksum_sha256: checksum,
      p_source_filename: file.name || filename,
      p_created_by: actorStaffId,
      p_owner_staff_id: ownerStaffId || actorStaffId,
      p_effective_date: cleanDate(effectiveDate, "effectiveDate"),
      p_expiry_date: cleanDate(expiryDate, "expiryDate"),
      p_review_due_at: cleanDate(reviewDueAt, "reviewDueAt"),
      p_retention_until: cleanDate(retentionUntil, "retentionUntil"),
      p_reference_table: optionalText(referenceType, 160),
      p_reference_id: referenceId || null,
      p_source_organization_document_id: sourceOrganizationDocumentId || null,
      p_metadata: {
        ...metadataObject(metadata),
        tags: cleanTags(tags),
        approval_required: false,
        financial_impact: false,
      },
    });
    if (rpc.error) throw rpc.error;

    const normalizedTags = cleanTags(tags);
    if (normalizedTags.length) {
      const { error: tagError } = await supabaseAdmin
        .from("enterprise_documents")
        .update({ tags: normalizedTags })
        .eq("organization_id", organizationId)
        .eq("id", documentId);
      if (tagError) throw tagError;
    }

    return rpc.data;
  } catch (error) {
    await removePrivateFile(path);
    throw error;
  }
}

export async function appendControlledDocumentVersion({
  organizationId,
  documentId,
  actor = null,
  file,
  changeSummary = null,
  metadata = {},
} = {}) {
  if (!organizationId || !documentId) throw new Error("organizationId and documentId required");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("file required");

  const document = await ensureDocument({ organizationId, documentId });
  const currentVersion = Math.max(Number(document.version_number || 1), 1);
  const nextVersion = currentVersion + 1;
  const filename = safeName(file.name || document.document_name || "document");
  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = sha256(buffer);
  const mimeType = optionalText(file.type, 200) || "application/octet-stream";
  const path = storagePath({
    organizationId,
    entityId: document.entity_id || null,
    documentId,
    version: nextVersion,
    filename,
  });

  await uploadPrivateFile({ path, buffer, mimeType });

  try {
    const rpc = await supabaseAdmin.rpc("append_enterprise_document_version_atomic", {
      p_organization_id: organizationId,
      p_document_id: documentId,
      p_storage_path: path,
      p_file_size_bytes: buffer.length,
      p_mime_type: mimeType,
      p_checksum_sha256: checksum,
      p_source_filename: file.name || filename,
      p_change_summary: optionalText(changeSummary, 1000),
      p_uploaded_by: actorId(actor),
      p_metadata: metadataObject(metadata),
    });
    if (rpc.error) throw rpc.error;
    return rpc.data;
  } catch (error) {
    await removePrivateFile(path);
    throw error;
  }
}

export async function createDocumentSignedUrl({
  organizationId,
  documentId,
  versionNumber = null,
  expiresIn = 300,
} = {}) {
  const document = await ensureDocument({ organizationId, documentId });
  let storagePathValue = document.storage_path;
  let resolvedVersion = Number(document.version_number || 1);

  if (versionNumber !== null && Number(versionNumber) !== resolvedVersion) {
    const { data: version, error } = await supabaseAdmin
      .from("enterprise_document_versions")
      .select("version_number,storage_path")
      .eq("organization_id", organizationId)
      .eq("enterprise_document_id", documentId)
      .eq("version_number", Number(versionNumber))
      .maybeSingle();
    if (error) throw error;
    if (!version) {
      const notFound = new Error("Document version not found");
      notFound.status = 404;
      throw notFound;
    }
    storagePathValue = version.storage_path;
    resolvedVersion = version.version_number;
  }

  if (!storagePathValue) throw new Error("Document has no stored file");

  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(storagePathValue, Math.max(30, Math.min(Number(expiresIn) || 300, 3600)));
  if (error) throw error;

  return {
    url: data?.signedUrl || null,
    version_number: resolvedVersion,
    expires_in: Math.max(30, Math.min(Number(expiresIn) || 300, 3600)),
  };
}

export async function updateControlledDocument({
  organizationId,
  documentId,
  actor = null,
  patch = {},
} = {}) {
  const current = await ensureDocument({ organizationId, documentId });
  const allowedStatus = new Set(["draft", "review", "pending_approval", "approved", "active", "archived", "superseded", "obsolete"]);
  const update = {};

  if (Object.prototype.hasOwnProperty.call(patch, "documentName")) {
    update.document_name = clean(patch.documentName, 500);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "documentType")) {
    update.document_type = clean(patch.documentType, 120).toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "documentNumber")) {
    update.document_number = optionalText(patch.documentNumber, 160);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "classification")) {
    update.classification = cleanClassification(patch.classification);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ownerStaffId")) {
    update.owner_staff_id = patch.ownerStaffId || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "effectiveDate")) {
    update.effective_date = cleanDate(patch.effectiveDate, "effectiveDate");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "expiryDate")) {
    update.expiry_date = cleanDate(patch.expiryDate, "expiryDate");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "reviewDueAt")) {
    update.review_due_at = cleanDate(patch.reviewDueAt, "reviewDueAt");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "retentionUntil")) {
    update.retention_until = cleanDate(patch.retentionUntil, "retentionUntil");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "legalHold")) {
    update.legal_hold = patch.legalHold === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "tags")) {
    update.tags = cleanTags(patch.tags);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    const status = clean(patch.status, 80).toLowerCase();
    if (!allowedStatus.has(status)) throw new Error("Unsupported document status");
    update.document_status = status;
    if (status !== "approved" && status !== "active") {
      update.approved_by = null;
      update.approved_at = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "metadata")) {
    update.metadata = { ...metadataObject(current.metadata), ...metadataObject(patch.metadata) };
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("enterprise_documents")
    .update(update)
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .select("*")
    .single();
  if (error) throw error;

  await supabaseAdmin.from("enterprise_document_access_logs").insert({
    organization_id: organizationId,
    enterprise_document_id: documentId,
    accessed_by: actorId(actor),
    access_type: "UPDATE",
    metadata: { changed_fields: Object.keys(update).filter((key) => key !== "updated_at") },
    accessed_at: new Date().toISOString(),
  });

  return data;
}

export async function linkControlledDocument({
  organizationId,
  documentId,
  entityId = null,
  actor = null,
  referenceType,
  referenceId,
  relationType = "RELATED",
} = {}) {
  await ensureDocument({ organizationId, documentId });
  const relation = clean(relationType || "RELATED", 40).toUpperCase();
  const allowedRelations = new Set(["RELATED", "EVIDENCE", "SOURCE", "OUTPUT", "ATTACHMENT", "CONTRACT", "RECORD"]);
  if (!allowedRelations.has(relation)) throw new Error("Unsupported document relation type");
  if (!clean(referenceType, 160) || !referenceId) throw new Error("referenceType and referenceId required");

  const { data, error } = await supabaseAdmin
    .from("enterprise_document_links")
    .upsert(
      {
        organization_id: organizationId,
        entity_id: entityId || null,
        enterprise_document_id: documentId,
        reference_type: clean(referenceType, 160),
        reference_id: referenceId,
        relation_type: relation,
        created_by: actorId(actor),
      },
      { onConflict: "enterprise_document_id,reference_type,reference_id,relation_type" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function requestDocumentApproval({ organizationId, documentId, actor = null } = {}) {
  const document = await ensureDocument({ organizationId, documentId });
  const currentVersion = Number(document.version_number || 1);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reference_table", "enterprise_documents")
    .eq("reference_id", documentId)
    .in("status", ["pending", "requested", "open", "in_review", "under_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { request: existing, idempotent: true };

  const { data, error } = await supabaseAdmin
    .from("approval_requests")
    .insert({
      organization_id: organizationId,
      reference_table: "enterprise_documents",
      reference_id: documentId,
      current_step: 1,
      status: "pending",
      requested_by: actorId(actor),
    })
    .select("*")
    .single();
  if (error) throw error;

  await supabaseAdmin
    .from("enterprise_documents")
    .update({
      document_status: "pending_approval",
      metadata: {
        ...metadataObject(document.metadata),
        approval_requested_version: currentVersion,
        approval_request_id: data.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", documentId);

  return { request: data, idempotent: false };
}

export async function decideDocumentApproval({
  organizationId,
  documentId,
  actor = null,
  decision,
  notes = null,
} = {}) {
  const normalizedDecision = clean(decision, 32).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
    throw new Error("decision must be APPROVE or REJECT");
  }
  const document = await ensureDocument({ organizationId, documentId });
  const currentVersion = Number(document.version_number || 1);
  const requestedVersion = Number(metadataObject(document.metadata).approval_requested_version || currentVersion);
  if (requestedVersion !== currentVersion) {
    const conflict = new Error("Document changed after approval was requested; request approval for the current version");
    conflict.status = 409;
    conflict.code = "DOCUMENT_APPROVAL_VERSION_STALE";
    throw conflict;
  }

  const { data: request, error: requestError } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reference_table", "enterprise_documents")
    .eq("reference_id", documentId)
    .in("status", ["pending", "requested", "open", "in_review", "under_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!request) {
    const notFound = new Error("Open document approval request not found");
    notFound.status = 404;
    throw notFound;
  }

  const staffId = actorId(actor);
  const now = new Date().toISOString();
  const requestPatch = normalizedDecision === "APPROVE"
    ? { status: "approved", approved_by: staffId, approved_at: now }
    : { status: "rejected", rejected_by: staffId, rejected_at: now, rejection_reason: optionalText(notes, 1000) };
  const { data: decidedRequest, error: decideError } = await supabaseAdmin
    .from("approval_requests")
    .update(requestPatch)
    .eq("organization_id", organizationId)
    .eq("id", request.id)
    .in("status", ["pending", "requested", "open", "in_review", "under_review"])
    .select("*")
    .maybeSingle();
  if (decideError) throw decideError;
  if (!decidedRequest) {
    const conflict = new Error("Approval request changed concurrently; refresh and retry");
    conflict.status = 409;
    throw conflict;
  }

  const documentPatch = normalizedDecision === "APPROVE"
    ? {
        document_status: "approved",
        approved_by: staffId,
        approved_at: now,
        updated_at: now,
        metadata: { ...metadataObject(document.metadata), approval_decision_notes: optionalText(notes, 1000) },
      }
    : {
        document_status: "draft",
        approved_by: null,
        approved_at: null,
        updated_at: now,
        metadata: { ...metadataObject(document.metadata), approval_rejection_reason: optionalText(notes, 1000) },
      };

  const { data: updatedDocument, error: documentError } = await supabaseAdmin
    .from("enterprise_documents")
    .update(documentPatch)
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("version_number", currentVersion)
    .select("*")
    .maybeSingle();
  if (documentError) throw documentError;
  if (!updatedDocument) {
    const conflict = new Error("Document changed while approval was being decided");
    conflict.status = 409;
    throw conflict;
  }

  return { request: decidedRequest, document: updatedDocument };
}

export async function createSignatureRequest({
  organizationId,
  documentId,
  entityId = null,
  actor = null,
  signerPartyId = null,
  signerName = null,
  signerEmail = null,
  signingOrder = 1,
  expiresAt = null,
  provider = null,
} = {}) {
  const document = await ensureDocument({ organizationId, documentId });
  if (!signerPartyId && !clean(signerName, 240) && !clean(signerEmail, 320)) {
    throw new Error("A signer Party, name or email is required");
  }
  if (!document.approved_at && !["approved", "active"].includes(clean(document.document_status, 80).toLowerCase())) {
    const conflict = new Error("Approve the current document version before requesting signature");
    conflict.status = 409;
    throw conflict;
  }

  const payload = {
    organization_id: organizationId,
    entity_id: entityId || document.entity_id || null,
    enterprise_document_id: documentId,
    version_number: Number(document.version_number || 1),
    signer_party_id: signerPartyId || null,
    signer_name: optionalText(signerName, 240),
    signer_email: optionalText(signerEmail, 320),
    signing_order: Math.max(1, Number(signingOrder) || 1),
    status: "PENDING",
    requested_by: actorId(actor),
    requested_at: new Date().toISOString(),
    expires_at: cleanTimestamp(expiresAt, "expiresAt"),
    provider: optionalText(provider, 120),
    evidence: {
      signature_authority_created: false,
      legal_acceptance_authority_created: false,
      binding_submission_authority_created: false,
    },
  };

  const { data, error } = await supabaseAdmin
    .from("document_signature_requests")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSignatureRequest({
  organizationId,
  signatureRequestId,
  actor = null,
  status,
  providerReference = null,
  evidence = {},
} = {}) {
  const normalizedStatus = clean(status, 40).toUpperCase();
  if (!SIGNATURE_STATUSES.has(normalizedStatus)) throw new Error("Unsupported signature status");
  const now = new Date().toISOString();
  const patch = {
    status: normalizedStatus,
    provider_reference: optionalText(providerReference, 300),
    evidence: metadataObject(evidence),
    updated_at: now,
  };
  if (normalizedStatus === "SIGNED") patch.signed_at = now;
  if (normalizedStatus === "DECLINED") patch.declined_at = now;

  const { data, error } = await supabaseAdmin
    .from("document_signature_requests")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", signatureRequestId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error("Signature request not found");
    notFound.status = 404;
    throw notFound;
  }

  await supabaseAdmin.from("enterprise_document_access_logs").insert({
    organization_id: organizationId,
    enterprise_document_id: data.enterprise_document_id,
    accessed_by: actorId(actor),
    access_type: `SIGNATURE_${normalizedStatus}`,
    metadata: { signature_request_id: data.id, version_number: data.version_number },
    accessed_at: now,
  });

  return data;
}

export async function createRetentionPolicy({
  organizationId,
  entityId = null,
  actor = null,
  policyName,
  documentType = null,
  classification = null,
  retentionDays,
  dispositionAction = "REVIEW",
  legalHoldBlocksDisposition = true,
} = {}) {
  const action = clean(dispositionAction || "REVIEW", 40).toUpperCase();
  if (!RETENTION_ACTIONS.has(action)) throw new Error("Unsupported disposition action");
  const days = Number(retentionDays);
  if (!Number.isInteger(days) || days < 0) throw new Error("retentionDays must be a non-negative integer");

  const { data, error } = await supabaseAdmin
    .from("document_retention_policies")
    .insert({
      organization_id: organizationId,
      entity_id: entityId || null,
      policy_name: clean(policyName, 240),
      document_type: optionalText(documentType, 120),
      classification: classification ? cleanClassification(classification) : null,
      retention_days: days,
      disposition_action: action,
      legal_hold_blocks_disposition: legalHoldBlocksDisposition !== false,
      active: true,
      created_by: actorId(actor),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function scheduleDocumentDisposition({
  organizationId,
  documentId,
  entityId = null,
  policyId = null,
  action = "REVIEW",
  scheduledFor = null,
} = {}) {
  const document = await ensureDocument({ organizationId, documentId });
  if (document.legal_hold === true) {
    const conflict = new Error("Document is under legal hold and cannot enter disposition");
    conflict.status = 409;
    conflict.code = "DOCUMENT_LEGAL_HOLD";
    throw conflict;
  }
  const normalizedAction = clean(action || "REVIEW", 40).toUpperCase();
  if (!RETENTION_ACTIONS.has(normalizedAction)) throw new Error("Unsupported disposition action");

  const { data, error } = await supabaseAdmin
    .from("document_disposition_events")
    .insert({
      organization_id: organizationId,
      entity_id: entityId || document.entity_id || null,
      enterprise_document_id: documentId,
      policy_id: policyId || null,
      action: normalizedAction,
      status: "PENDING",
      scheduled_for: cleanDate(scheduledFor, "scheduledFor"),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function decideDocumentDisposition({
  organizationId,
  eventId,
  actor = null,
  decision,
  notes = null,
} = {}) {
  const normalizedDecision = clean(decision, 40).toUpperCase();
  if (!["APPROVE", "REJECT", "CANCEL"].includes(normalizedDecision)) {
    throw new Error("decision must be APPROVE, REJECT or CANCEL");
  }
  const status = normalizedDecision === "APPROVE" ? "APPROVED" : normalizedDecision === "REJECT" ? "REJECTED" : "CANCELLED";
  if (!DISPOSITION_STATUSES.has(status)) throw new Error("Unsupported disposition status");

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("document_disposition_events")
    .update({
      status,
      decided_by: actorId(actor),
      decision_notes: optionalText(notes, 1000),
      decided_at: now,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error("Disposition event is no longer pending");
    conflict.status = 409;
    throw conflict;
  }
  return data;
}

export async function executeDocumentDisposition({
  organizationId,
  eventId,
  actor = null,
} = {}) {
  const { data: event, error } = await supabaseAdmin
    .from("document_disposition_events")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (error) throw error;
  if (!event) {
    const conflict = new Error("Approved disposition event not found");
    conflict.status = 409;
    throw conflict;
  }

  const document = await ensureDocument({ organizationId, documentId: event.enterprise_document_id });
  if (document.legal_hold === true) {
    const conflict = new Error("Document entered legal hold after disposition approval");
    conflict.status = 409;
    conflict.code = "DOCUMENT_LEGAL_HOLD";
    throw conflict;
  }

  const now = new Date().toISOString();
  if (event.action === "ARCHIVE") {
    const { error: archiveError } = await supabaseAdmin
      .from("enterprise_documents")
      .update({ document_status: "archived", updated_at: now })
      .eq("organization_id", organizationId)
      .eq("id", document.id);
    if (archiveError) throw archiveError;
  } else if (event.action === "DELETE") {
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from("enterprise_document_versions")
      .select("storage_path")
      .eq("organization_id", organizationId)
      .eq("enterprise_document_id", document.id);
    if (versionsError) throw versionsError;
    const paths = [...new Set((versions || []).map((row) => row.storage_path).filter(Boolean))];
    if (paths.length) {
      const { error: storageError } = await supabaseAdmin.storage.from(DOCUMENT_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }
    const { error: deleteError } = await supabaseAdmin
      .from("enterprise_documents")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", document.id);
    if (deleteError) throw deleteError;
  }

  const { data: executed, error: executeError } = await supabaseAdmin
    .from("document_disposition_events")
    .update({
      status: "EXECUTED",
      executed_at: now,
      updated_at: now,
      evidence: {
        executed_by: actorId(actor),
        action: event.action,
        document_id: document.id,
        version_number: document.version_number,
      },
    })
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .eq("status", "APPROVED")
    .select("*")
    .single();
  if (executeError) throw executeError;
  return executed;
}
