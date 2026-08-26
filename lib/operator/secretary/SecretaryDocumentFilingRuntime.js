import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_FILING_V1";
const SOURCE = "secretary_document_filing";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function documentTaskId(organization, key) {
  return deterministicUuid(`avantiqo-secretary-document-filing-v1:${organization}:${key}`);
}

function followUpId(taskId, partyId, kind, version) {
  return deterministicUuid(`avantiqo-secretary-document-filing-follow-up-v1:${taskId}:${partyId}:${kind}:${version}`);
}

function documentKey(payload = {}) {
  const key = text(payload.document_key || payload.documentKey || payload.document_reference || payload.documentReference, 700);
  if (!key) throw new Error("SECRETARY_DOCUMENT_FILING_DOCUMENT_KEY_REQUIRED");
  return key;
}

function cleanName(value, fallback = "document") {
  const normalized = text(value, 240)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return normalized || fallback;
}

function extensionFrom(value) {
  const match = text(value, 600).match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : null;
}

function explicitDateToken(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error("SECRETARY_DOCUMENT_FILING_DOCUMENT_DATE_INVALID");
  return new Date(parsed).toISOString().slice(0, 10);
}

function canonicalFilename(metadata, version, originalFilename) {
  const explicitName = text(metadata.naming_base, 240);
  const base = cleanName(explicitName || metadata.document_title || metadata.document_key, "document");
  const date = metadata.document_date ? explicitDateToken(metadata.document_date) : null;
  const extension = extensionFrom(originalFilename) || text(metadata.default_extension, 12).toLowerCase() || null;
  const parts = [date, base, `v${version}`].filter(Boolean);
  return `${parts.join("_")}${extension ? `.${extension}` : ""}`;
}

function canonicalFilingPath(metadata, filename) {
  const folder = text(metadata.filing_folder, 1200);
  if (!folder) return filename;
  return `${folder.replace(/\/+$/g, "")}/${filename}`;
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "MESSAGE";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  return text(profile?.preferred_channel, 120).toLowerCase().includes("email") ? "EMAIL" : "MESSAGE";
}

async function loadDocumentTask(organization, payload = {}) {
  const direct = text(payload.document_id || payload.documentId, 120);
  const id = direct || documentTaskId(organization, documentKey(payload));
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
}

async function mutateDocumentTask(organization, payload, producer) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = await loadDocumentTask(organization, payload);
    if (!task) throw new Error("SECRETARY_DOCUMENT_FILING_NOT_FOUND");
    const produced = await producer(task, object(task.metadata));
    const update = await supabaseAdmin.from("secretary_tasks")
      .update({
        ...object(produced.task_patch),
        metadata: produced.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return { task: update.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_DOCUMENT_FILING_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function ensureFollowUp({ task, partyId, kind, version = 0, dueAt, instruction }) {
  const id = followUpId(task.id, partyId, kind, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: partyId,
    task_id: task.id,
    calendar_event_id: task.calendar_event_id || null,
    action_type: await preferredActionType(task.organization_id, partyId),
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt || new Date().toISOString(),
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_document_filing: true,
      secretary_document_filing_task_id: task.id,
      secretary_document_filing_kind: kind,
      secretary_document_filing_version: version,
      signature_authority_created: false,
      legal_acceptance_authority_created: false,
      binding_submission_authority_created: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups").select("*")
          .eq("organization_id", task.organization_id).eq("id", id).single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelFollowUps({ task, kinds = null, version = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_document_filing !== true) return false;
    if (allowed && !allowed.has(text(metadata.secretary_document_filing_kind, 100))) return false;
    if (version !== null && Number(metadata.secretary_document_filing_version) !== Number(version)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1000), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids.length;
}

function missingRequestInstruction(metadata, chase = false) {
  return [
    chase ? "Follow up once for the missing document." : "Request the missing document.",
    `Document: ${text(metadata.document_title || metadata.document_key, 500)}.`,
    metadata.document_type ? `Type: ${text(metadata.document_type, 160)}.` : null,
    metadata.filing_folder ? `Intended filing folder: ${text(metadata.filing_folder, 600)}.` : null,
    "Ask only for the document or explicit evidence that it is unavailable. Do not describe it as received, reviewed, signed, accepted, submitted, approved, or legally effective without explicit evidence for that separate state.",
  ].filter(Boolean).join(" ");
}

async function materializeMissingDocumentFollowUps(task) {
  const metadata = object(task.metadata);
  if (metadata.document_status !== "MISSING" || !metadata.responsible_party_id) return [];
  const request = await ensureFollowUp({
    task,
    partyId: metadata.responsible_party_id,
    kind: "DOCUMENT_REQUEST",
    dueAt: new Date().toISOString(),
    instruction: missingRequestInstruction(metadata, false),
  });
  let chase = null;
  const deadline = Date.parse(metadata.collection_deadline || "");
  if (Number.isFinite(deadline) && deadline > Date.now() + 2 * 60 * 1000) {
    const due = new Date(Date.now() + Math.max(60 * 1000, Math.floor((deadline - Date.now()) / 2))).toISOString();
    chase = await ensureFollowUp({
      task,
      partyId: metadata.responsible_party_id,
      kind: "DOCUMENT_CHASE",
      dueAt: due,
      instruction: missingRequestInstruction(metadata, true),
    });
  }
  return [request?.id, chase?.id].filter(Boolean);
}

export async function registerSecretaryDocumentFile({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const key = documentKey(payload);
  const id = documentTaskId(organization, key);
  let task = await one(
    supabaseAdmin.from("secretary_tasks").select("*")
      .eq("organization_id", organization).eq("id", id).maybeSingle(),
  );
  if (!task) {
    const status = payload.expected_missing === true || payload.expectedMissing === true ? "MISSING" : "REGISTERED";
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      secretary_document_filing: true,
      document_filing_contract: CONTRACT,
      document_store: "REFERENCES_ONLY",
      document_key: key,
      document_title: text(payload.document_title || payload.documentTitle, 600) || key,
      document_type: text(payload.document_type || payload.documentType, 160) || null,
      category: text(payload.category, 160) || null,
      subject_reference: text(payload.subject_reference || payload.subjectReference, 700) || null,
      responsible_party_id: text(payload.responsible_party_id || payload.responsiblePartyId, 120) || null,
      filing_folder: text(payload.filing_folder || payload.filingFolder, 1200) || null,
      naming_base: text(payload.naming_base || payload.namingBase, 240) || null,
      document_date: text(payload.document_date || payload.documentDate, 80) || null,
      default_extension: text(payload.default_extension || payload.defaultExtension, 12) || null,
      collection_deadline: text(payload.collection_deadline || payload.collectionDeadline, 160) || null,
      document_status: status,
      current_version: 0,
      versions: [],
      classification_history: [],
      unavailability_evidence: null,
      duplicate_reference_blocked: true,
      filing_does_not_imply_review: true,
      filing_does_not_imply_signature: true,
      filing_does_not_imply_acceptance: true,
      filing_does_not_imply_submission: true,
      signature_authority_created: false,
      legal_acceptance_authority_created: false,
      binding_submission_authority_created: false,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id,
      organization_id: organization,
      entity_id: payload.entity_id || payload.entityId || context.entityId || null,
      owner_party_id: actor,
      contact_party_id: metadata.responsible_party_id,
      title: `File document: ${text(metadata.document_title, 360)}`,
      details: `Durable Secretary document register for ${text(key, 600)}; source files remain external references only.`,
      status: "IN_PROGRESS",
      priority: status === "MISSING" ? "HIGH" : "NORMAL",
      due_at: metadata.collection_deadline || null,
      remind_at: null,
      source: SOURCE,
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadDocumentTask(organization, { document_id: id });
    } else task = inserted.data;
  }
  const followUpIds = await materializeMissingDocumentFollowUps(task);
  return {
    status: "registered",
    contract: CONTRACT,
    document_id: task.id,
    task,
    deterministic_document_id: task.id === id,
    missing_document_follow_up_ids: followUpIds,
    document_store: "REFERENCES_ONLY",
    external_authority_used: false,
  };
}

export async function fileSecretaryDocumentVersion({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  const sourceReference = text(payload.source_reference || payload.sourceReference || payload.file_reference || payload.fileReference, 1800);
  const originalFilename = text(payload.original_filename || payload.originalFilename, 600);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_FILING_RECEIPT_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_DOCUMENT_FILING_SOURCE_REFERENCE_REQUIRED");
  if (!originalFilename) throw new Error("SECRETARY_DOCUMENT_FILING_ORIGINAL_FILENAME_REQUIRED");
  const changed = await mutateDocumentTask(organization, payload, async (_task, metadata) => {
    const versions = list(metadata.versions);
    const duplicate = versions.find((row) => row.evidence_id === evidenceId || row.source_reference === sourceReference);
    if (duplicate) return { metadata, output: { version: duplicate, idempotent: true } };
    const versionNumber = Number(metadata.current_version || 0) + 1;
    const filename = canonicalFilename(metadata, versionNumber, originalFilename);
    const filedAt = new Date().toISOString();
    const nextVersion = {
      version: versionNumber,
      status: "CURRENT",
      evidence_id: evidenceId,
      source_reference: sourceReference,
      original_filename: originalFilename,
      canonical_filename: filename,
      filing_path: canonicalFilingPath(metadata, filename),
      received_from_party_id: text(payload.received_from_party_id || payload.receivedFromPartyId, 120) || null,
      received_at: text(payload.received_at || payload.receivedAt, 160) || filedAt,
      filed_at: filedAt,
      filed_by_party_id: actor,
      checksum_reference: text(payload.checksum_reference || payload.checksumReference, 300) || null,
      notes: text(payload.notes, 1200) || null,
      filing_does_not_imply_review: true,
      filing_does_not_imply_signature: true,
      filing_does_not_imply_acceptance: true,
      filing_does_not_imply_submission: true,
    };
    const nextVersions = versions.map((row) => row.status === "CURRENT" ? { ...row, status: "SUPERSEDED", superseded_at: filedAt, superseded_by_version: versionNumber } : row);
    nextVersions.push(nextVersion);
    return {
      metadata: {
        ...metadata,
        document_status: "FILED",
        current_version: versionNumber,
        versions: nextVersions.slice(-50),
        unavailability_evidence: null,
        signature_authority_created: false,
        legal_acceptance_authority_created: false,
        binding_submission_authority_created: false,
        external_authority_used: false,
      },
      output: { version: nextVersion, idempotent: false },
    };
  });
  if (!changed.output.idempotent) {
    await cancelFollowUps({
      task: changed.task,
      kinds: ["DOCUMENT_REQUEST", "DOCUMENT_CHASE"],
      reason: "Document version filed with explicit receipt evidence.",
    });
  }
  return {
    status: changed.output.idempotent ? "version_already_filed" : "version_filed",
    task: changed.task,
    version: changed.output.version,
    idempotent: changed.output.idempotent,
    prior_version_superseded_not_deleted: true,
    document_store: "REFERENCES_ONLY",
    filing_does_not_imply_review: true,
    filing_does_not_imply_signature: true,
    filing_does_not_imply_acceptance: true,
    filing_does_not_imply_submission: true,
    external_authority_used: false,
  };
}

export async function recordSecretaryDocumentUnavailable({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 240);
  const reason = text(payload.reason, 1200);
  if (!evidenceId) throw new Error("SECRETARY_DOCUMENT_FILING_UNAVAILABLE_EVIDENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_DOCUMENT_FILING_UNAVAILABLE_REASON_REQUIRED");
  const changed = await mutateDocumentTask(organization, payload, async (_task, metadata) => {
    if (metadata.unavailability_evidence?.evidence_id === evidenceId) return { metadata, output: { idempotent: true } };
    return {
      metadata: {
        ...metadata,
        document_status: "UNAVAILABLE_RECORDED",
        unavailability_evidence: { evidence_id: evidenceId, reason, recorded_at: new Date().toISOString() },
        external_authority_used: false,
      },
      output: { idempotent: false },
    };
  });
  await cancelFollowUps({ task: changed.task, kinds: ["DOCUMENT_REQUEST", "DOCUMENT_CHASE"], reason: "Document unavailability explicitly recorded with evidence." });
  return { status: changed.output.idempotent ? "unavailability_already_recorded" : "unavailability_recorded", task: changed.task, missing_document_exception_preserved: true, external_authority_used: false };
}

export async function reclassifySecretaryDocumentFile({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_DOCUMENT_FILING_RECLASSIFICATION_REASON_REQUIRED");
  const changed = await mutateDocumentTask(organization, payload, async (_task, metadata) => {
    const before = {
      filing_folder: metadata.filing_folder || null,
      category: metadata.category || null,
      naming_base: metadata.naming_base || null,
      document_type: metadata.document_type || null,
    };
    const after = {
      filing_folder: payload.filing_folder !== undefined || payload.filingFolder !== undefined ? text(payload.filing_folder || payload.filingFolder, 1200) || null : before.filing_folder,
      category: payload.category !== undefined ? text(payload.category, 160) || null : before.category,
      naming_base: payload.naming_base !== undefined || payload.namingBase !== undefined ? text(payload.naming_base || payload.namingBase, 240) || null : before.naming_base,
      document_type: payload.document_type !== undefined || payload.documentType !== undefined ? text(payload.document_type || payload.documentType, 160) || null : before.document_type,
    };
    const changedAny = JSON.stringify(before) !== JSON.stringify(after);
    if (!changedAny) return { metadata, output: { changed: false } };
    const recordedAt = new Date().toISOString();
    return {
      metadata: {
        ...metadata,
        ...after,
        classification_history: [...list(metadata.classification_history), { before, after, reason, changed_by_party_id: actor, changed_at: recordedAt }].slice(-30),
        current_version_paths_need_reconciliation: Number(metadata.current_version || 0) > 0,
        external_authority_used: false,
      },
      output: { changed: true, before, after },
    };
  });
  return {
    status: changed.output.changed ? "reclassified" : "no_change",
    task: changed.task,
    classification_history_preserved: true,
    stored_source_reference_mutated: false,
    external_authority_used: false,
  };
}

export async function reconcileSecretaryDocumentCurrentName({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const reason = text(payload.reason, 1200);
  if (!reason) throw new Error("SECRETARY_DOCUMENT_FILING_RENAME_REASON_REQUIRED");
  const changed = await mutateDocumentTask(organization, payload, async (_task, metadata) => {
    const currentVersion = Number(metadata.current_version || 0);
    if (!currentVersion) throw new Error("SECRETARY_DOCUMENT_FILING_NO_CURRENT_VERSION");
    const versions = list(metadata.versions);
    const index = versions.findIndex((row) => Number(row.version) === currentVersion && row.status === "CURRENT");
    if (index < 0) throw new Error("SECRETARY_DOCUMENT_FILING_CURRENT_VERSION_NOT_FOUND");
    const current = versions[index];
    const filename = canonicalFilename(metadata, currentVersion, current.original_filename);
    const filingPath = canonicalFilingPath(metadata, filename);
    const updated = versions.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      canonical_filename: filename,
      filing_path: filingPath,
      naming_history: [...list(row.naming_history), {
        prior_canonical_filename: row.canonical_filename,
        prior_filing_path: row.filing_path,
        reason,
        changed_by_party_id: actor,
        changed_at: new Date().toISOString(),
      }].slice(-20),
    } : row);
    return {
      metadata: { ...metadata, versions: updated, current_version_paths_need_reconciliation: false, external_authority_used: false },
      output: { version: updated[index] },
    };
  });
  return {
    status: "current_name_reconciled",
    task: changed.task,
    version: changed.output.version,
    source_reference_preserved: true,
    naming_history_preserved: true,
    external_authority_used: false,
  };
}

export async function readSecretaryDocumentFile({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadDocumentTask(organization, payload);
  if (!task) throw new Error("SECRETARY_DOCUMENT_FILING_NOT_FOUND");
  const metadata = object(task.metadata);
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,due_at,result,metadata")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .limit(500),
  );
  return {
    status: "read",
    contract: CONTRACT,
    document_id: task.id,
    document_key: metadata.document_key,
    document_status: metadata.document_status,
    document_title: metadata.document_title,
    document_type: metadata.document_type,
    category: metadata.category,
    filing_folder: metadata.filing_folder,
    current_version: Number(metadata.current_version || 0),
    versions: list(metadata.versions),
    classification_history: list(metadata.classification_history),
    unavailability_evidence: metadata.unavailability_evidence || null,
    follow_ups: followUps,
    document_store: "REFERENCES_ONLY",
    filing_does_not_imply_review: true,
    filing_does_not_imply_signature: true,
    filing_does_not_imply_acceptance: true,
    filing_does_not_imply_submission: true,
    external_authority_used: false,
  };
}

export async function listSecretaryDocumentFiles({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("id,title,status,due_at,metadata,created_at,updated_at")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("updated_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(payload.limit || 100)))),
  );
  const category = text(payload.category, 160).toLowerCase();
  const documentType = text(payload.document_type || payload.documentType, 160).toLowerCase();
  const query = text(payload.query, 400).toLowerCase();
  const status = text(payload.document_status || payload.documentStatus, 80).toUpperCase();
  const filtered = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (category && text(metadata.category, 160).toLowerCase() !== category) return false;
    if (documentType && text(metadata.document_type, 160).toLowerCase() !== documentType) return false;
    if (status && text(metadata.document_status, 80).toUpperCase() !== status) return false;
    if (query) {
      const haystack = [metadata.document_key, metadata.document_title, metadata.subject_reference, metadata.filing_folder, metadata.category, metadata.document_type].map((value) => text(value, 1200).toLowerCase()).join(" ");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  return {
    status: "listed",
    contract: CONTRACT,
    count: filtered.length,
    documents: filtered.map((row) => ({
      document_id: row.id,
      document_key: row.metadata?.document_key,
      document_title: row.metadata?.document_title,
      document_status: row.metadata?.document_status,
      document_type: row.metadata?.document_type,
      category: row.metadata?.category,
      filing_folder: row.metadata?.filing_folder,
      current_version: Number(row.metadata?.current_version || 0),
      current: list(row.metadata?.versions).find((version) => version.status === "CURRENT") || null,
      updated_at: row.updated_at,
    })),
    document_store: "REFERENCES_ONLY",
    external_authority_used: false,
  };
}

export async function cancelSecretaryDocumentFile({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const current = await loadDocumentTask(organization, payload);
  if (!current) throw new Error("SECRETARY_DOCUMENT_FILING_NOT_FOUND");
  if (object(current.metadata).document_status === "CANCELLED") return { status: "already_cancelled", task: current, idempotent: true, source_document_deleted: false, external_authority_used: false };
  await cancelFollowUps({ task: current, reason: text(payload.reason, 1000) || "Document filing coordination cancelled." });
  const now = new Date().toISOString();
  const changed = await mutateDocumentTask(organization, { document_id: current.id }, async (_task, metadata) => ({
    metadata: { ...metadata, document_status: "CANCELLED", cancelled_at: now, cancellation_reason: text(payload.reason, 1000) || "Document filing coordination cancelled.", external_authority_used: false },
    task_patch: { status: "CANCELLED", completed_at: now },
  }));
  return { status: "cancelled", task: changed.task, source_document_deleted: false, version_history_preserved: true, external_authority_used: false };
}

export default Object.freeze({
  register: registerSecretaryDocumentFile,
  fileVersion: fileSecretaryDocumentVersion,
  recordUnavailable: recordSecretaryDocumentUnavailable,
  reclassify: reclassifySecretaryDocumentFile,
  reconcileCurrentName: reconcileSecretaryDocumentCurrentName,
  read: readSecretaryDocumentFile,
  list: listSecretaryDocumentFiles,
  cancel: cancelSecretaryDocumentFile,
});
