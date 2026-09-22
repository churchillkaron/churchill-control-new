import { createControlledDocument, createDocumentSignedUrl, updateControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assertStaffUploadSignature } from "@/lib/people/security/StaffUploadSecurity";

const WORK_PERMIT_DOCUMENT_TYPE = "STAFF_WORK_PERMIT";
const WORK_PERMIT_OBLIGATION_SOURCE = "STAFF_WORK_PERMIT";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_RENEWAL_LEAD_DAYS = 60;

function clean(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function dateOnly(value) {
  const normalized = clean(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function expired(value) {
  const date = dateOnly(value);
  return Boolean(date && date < new Date().toISOString().slice(0, 10));
}

function daysUntil(value) {
  const date = dateOnly(value);
  if (!date) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const target = Date.parse(`${date}T00:00:00.000Z`);
  return Math.ceil((target - today) / 86400000);
}

function permitState(row) {
  if (!row) return "NOT_PROVIDED";
  const reviewStatus = clean(row.metadata?.work_permit?.review_status, 40).toUpperCase();
  if (reviewStatus === "REJECTED") return "REJECTED";
  if (expired(row.expiry_date)) return "EXPIRED";
  const days = daysUntil(row.expiry_date);
  if (days !== null && days <= DEFAULT_RENEWAL_LEAD_DAYS) return "EXPIRING_SOON";
  if (reviewStatus === "VERIFIED") return "VERIFIED";
  return clean(row.document_status, 80).toUpperCase() || "PENDING_APPROVAL";
}

async function resolveCurrentEmployment({ organizationId, staffId }) {
  const today = new Date().toISOString().slice(0, 10);
  const assignments = await supabaseAdmin.from("employee_employment_assignments")
    .select("id,organization_id,entity_id,staff_account_id,party_id,effective_from,effective_to,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffId)
    .eq("status", "ACTIVE")
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false });
  if (assignments.error) throw assignments.error;
  const active = assignments.data || [];
  if (active.length !== 1) {
    const error = new Error(active.length ? "Exactly one current legal employer is required before uploading a work permit" : "Current legal employer must be assigned before uploading a work permit");
    error.status = 409;
    error.code = active.length ? "WORK_PERMIT_EMPLOYER_AMBIGUOUS" : "WORK_PERMIT_EMPLOYER_REQUIRED";
    throw error;
  }
  const assignment = active[0];
  const entity = await supabaseAdmin.from("legal_entities")
    .select("id,organization_id,code,legal_name,display_name,country,registration_number,is_active")
    .eq("organization_id", organizationId)
    .eq("id", assignment.entity_id)
    .eq("is_active", true)
    .maybeSingle();
  if (entity.error) throw entity.error;
  if (!entity.data) {
    const error = new Error("Assigned legal employer is missing or inactive");
    error.status = 409;
    error.code = "WORK_PERMIT_LEGAL_ENTITY_INVALID";
    throw error;
  }
  return { assignment, entity: entity.data };
}

function legalEmployerSummary(employment = null, row = null) {
  const entity = employment?.entity || null;
  if (entity) {
    return {
      legal_name: entity.legal_name || null,
      display_name: entity.display_name || null,
      country: entity.country || null,
    };
  }
  const metadata = row?.metadata?.work_permit || {};
  const legalName = clean(metadata.legal_entity_name, 240) || null;
  const country = clean(metadata.country, 40) || null;
  return legalName || country ? { legal_name: legalName, display_name: null, country } : null;
}

function publicStatus(row, employment = null, obligation = null) {
  if (!row) {
    return {
      optional: true,
      present: false,
      status: "NOT_PROVIDED",
      expiryDate: null,
      daysUntilExpiry: null,
      legalEntity: legalEmployerSummary(employment),
      complianceStatus: null,
      renewalLeadDays: DEFAULT_RENEWAL_LEAD_DAYS,
      submittedAt: null,
      updatedAt: null,
    };
  }
  return {
    optional: true,
    present: true,
    status: permitState(row),
    expiryDate: row.expiry_date || null,
    daysUntilExpiry: daysUntil(row.expiry_date),
    legalEntity: legalEmployerSummary(employment, row),
    complianceStatus: obligation?.status || null,
    renewalLeadDays: obligation?.renewal_lead_days ?? DEFAULT_RENEWAL_LEAD_DAYS,
    submittedAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function latest({ organizationId, staffId }) {
  const result = await supabaseAdmin.from("enterprise_documents")
    .select("id,entity_id,document_status,expiry_date,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("owner_staff_id", staffId)
    .eq("document_type", WORK_PERMIT_DOCUMENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function obligationForDocument({ organizationId, documentId }) {
  if (!documentId) return null;
  const result = await supabaseAdmin.from("compliance_obligations")
    .select("id,entity_id,owner_staff_id,status,expiry_date,renewal_lead_days,enterprise_document_id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("enterprise_document_id", documentId)
    .eq("source_type", WORK_PERMIT_OBLIGATION_SOURCE)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function createPermitObligation({ organizationId, staff, employment, documentId, expiryDate, permitNumber = null }) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("compliance_obligations")
    .update({ status: "CANCELLED", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("owner_staff_id", staff.id)
    .eq("source_type", WORK_PERMIT_OBLIGATION_SOURCE)
    .in("status", ["ACTIVE", "PENDING", "DRAFT", "SUSPENDED"]);

  const insert = await supabaseAdmin.from("compliance_obligations").insert({
    organization_id: organizationId,
    entity_id: employment.entity.id,
    obligation_type: "PERMIT",
    obligation_code: `WORK_PERMIT:${staff.id}`,
    title: `Work permit · ${staff.name || staff.email || staff.id}`,
    description: `Optional staff work permit tracked for ${employment.entity.legal_name}.`,
    authority_name: null,
    jurisdiction_code: clean(employment.entity.country, 20) || null,
    reference_number: clean(permitNumber, 160) || null,
    owner_staff_id: staff.id,
    source_domain: "people",
    source_type: WORK_PERMIT_OBLIGATION_SOURCE,
    source_id: documentId,
    effective_from: employment.assignment.effective_from || null,
    due_date: expiryDate,
    expiry_date: expiryDate,
    renewal_lead_days: DEFAULT_RENEWAL_LEAD_DAYS,
    status: "PENDING",
    criticality: "HIGH",
    enterprise_document_id: documentId,
    metadata: {
      optional_document: true,
      staff_id: staff.id,
      party_id: staff.party_id || employment.assignment.party_id || null,
      employment_assignment_id: employment.assignment.id,
      legal_entity_id: employment.entity.id,
      legal_entity_name: employment.entity.legal_name,
      legal_entity_registration_number: employment.entity.registration_number || null,
      country: employment.entity.country || null,
      expiry_monitoring: true,
      intelligence_visible: true,
      renewal_lead_days: DEFAULT_RENEWAL_LEAD_DAYS,
    },
    created_by: staff.id,
  }).select("id,status,expiry_date,renewal_lead_days,enterprise_document_id").single();
  if (insert.error) throw insert.error;
  return insert.data;
}

export async function loadStaffWorkPermit({ organizationId, staffId } = {}) {
  if (!organizationId || !staffId) throw new Error("organizationId and staffId required");
  let employment = null;
  try { employment = await resolveCurrentEmployment({ organizationId, staffId }); } catch {}
  const row = await latest({ organizationId, staffId });
  const obligation = await obligationForDocument({ organizationId, documentId: row?.id });
  return publicStatus(row, employment, obligation);
}

export async function uploadStaffWorkPermit({ organizationId, staff, file, expiryDate = null, permitNumber = null } = {}) {
  if (!organizationId || !staff?.id) throw new Error("Authenticated staff context required");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Work permit file required");
  const mimeType = clean(file.type, 120).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    const error = new Error("Work permit must be JPEG, PNG, WebP or PDF");
    error.status = 400;
    throw error;
  }
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_FILE_BYTES) {
    const error = new Error("Work permit must be 10 MB or smaller");
    error.status = 400;
    throw error;
  }
  await assertStaffUploadSignature(file, { allowedMimeTypes: ALLOWED_MIME_TYPES });
  const normalizedExpiry = dateOnly(expiryDate);
  if (!normalizedExpiry) {
    const error = new Error("Work permit expiry date is required for compliance tracking");
    error.status = 400;
    error.code = "WORK_PERMIT_EXPIRY_REQUIRED";
    throw error;
  }
  if (expired(normalizedExpiry)) {
    const error = new Error("Expired work permit cannot be uploaded as a current permit");
    error.status = 400;
    error.code = "WORK_PERMIT_ALREADY_EXPIRED";
    throw error;
  }

  const employment = await resolveCurrentEmployment({ organizationId, staffId: staff.id });
  const permitNo = clean(permitNumber, 160) || null;
  const created = await createControlledDocument({
    organizationId,
    entityId: employment.entity.id,
    actor: { staff },
    file,
    documentName: `Work Permit · ${staff.name || staff.email || "Staff"} · ${employment.entity.legal_name}`,
    documentType: WORK_PERMIT_DOCUMENT_TYPE,
    documentNumber: permitNo,
    classification: "RESTRICTED",
    ownerStaffId: staff.id,
    effectiveDate: employment.assignment.effective_from,
    expiryDate: normalizedExpiry,
    referenceType: "STAFF",
    referenceId: staff.id,
    tags: ["staff-compliance", "work-permit", "optional", `entity:${employment.entity.id}`],
    metadata: {
      work_permit: {
        optional: true,
        staff_id: staff.id,
        party_id: staff.party_id || employment.assignment.party_id || null,
        employment_assignment_id: employment.assignment.id,
        legal_entity_id: employment.entity.id,
        legal_entity_name: employment.entity.legal_name,
        legal_entity_registration_number: employment.entity.registration_number || null,
        country: employment.entity.country || null,
        expiry_date: normalizedExpiry,
        intelligence_visible: true,
        submitted_at: new Date().toISOString(),
        submitted_by_staff_id: staff.id,
      },
    },
  });
  const documentId = created?.document?.id || created?.id;
  if (!documentId) throw new Error("Work permit document could not be created");
  await updateControlledDocument({
    organizationId,
    documentId,
    actor: { staff },
    patch: { status: "pending_approval", expiryDate: normalizedExpiry },
  });
  const obligation = await createPermitObligation({ organizationId, staff, employment, documentId, expiryDate: normalizedExpiry, permitNumber: permitNo });
  const row = await latest({ organizationId, staffId: staff.id });
  return publicStatus(row, employment, obligation);
}

export async function loadWorkPermitReviewQueue({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  const documents = await supabaseAdmin.from("enterprise_documents")
    .select("id,owner_staff_id,entity_id,document_status,expiry_date,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("document_type", WORK_PERMIT_DOCUMENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (documents.error) throw documents.error;

  const rows = documents.data || [];
  const staffIds = [...new Set(rows.map((row) => row.owner_staff_id).filter(Boolean))];
  const entityIds = [...new Set(rows.map((row) => row.entity_id).filter(Boolean))];
  const documentIds = rows.map((row) => row.id).filter(Boolean);

  const [staffResult, entityResult, obligationResult] = await Promise.all([
    staffIds.length
      ? supabaseAdmin.from("staff_accounts").select("id,name,role,position,department,active").eq("active_organization_id", organizationId).in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
    entityIds.length
      ? supabaseAdmin.from("legal_entities").select("id,legal_name,display_name,country,is_active").eq("organization_id", organizationId).in("id", entityIds)
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabaseAdmin.from("compliance_obligations").select("id,enterprise_document_id,status,expiry_date,renewal_lead_days,metadata").eq("organization_id", organizationId).eq("source_type", WORK_PERMIT_OBLIGATION_SOURCE).in("enterprise_document_id", documentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [staffResult, entityResult, obligationResult]) if (result.error) throw result.error;

  const staffById = new Map((staffResult.data || []).map((row) => [row.id, row]));
  const entityById = new Map((entityResult.data || []).map((row) => [row.id, row]));
  const obligationByDocument = new Map((obligationResult.data || []).map((row) => [row.enterprise_document_id, row]));

  return rows.map((row) => {
    const obligation = obligationByDocument.get(row.id) || null;
    const review = row.metadata?.work_permit || {};
    return {
      documentId: row.id,
      staff: staffById.get(row.owner_staff_id) || { id: row.owner_staff_id },
      legalEntity: entityById.get(row.entity_id) || { id: row.entity_id },
      status: review.review_status || (String(row.document_status || "").toLowerCase() === "pending_approval" ? "PENDING" : String(row.document_status || "").toUpperCase()),
      documentStatus: row.document_status || null,
      expiryDate: row.expiry_date || null,
      daysUntilExpiry: daysUntil(row.expiry_date),
      obligationId: obligation?.id || null,
      obligationStatus: obligation?.status || null,
      submittedAt: row.created_at || null,
      reviewedAt: review.reviewed_at || null,
      reviewNotes: clean(review.review_notes, 1000) || null,
    };
  });
}

export async function createWorkPermitReviewSignedUrl({ organizationId, documentId } = {}) {
  const document = await supabaseAdmin.from("enterprise_documents")
    .select("id,document_type")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("document_type", WORK_PERMIT_DOCUMENT_TYPE)
    .maybeSingle();
  if (document.error) throw document.error;
  if (!document.data) {
    const error = new Error("Work permit document not found");
    error.status = 404;
    throw error;
  }
  return createDocumentSignedUrl({ organizationId, documentId, expiresIn: 180 });
}

export async function reviewStaffWorkPermit({ organizationId, manager, documentId, decision, notes = null } = {}) {
  if (!organizationId || !manager?.id || !documentId) {
    const error = new Error("Organization, manager and document are required");
    error.status = 400;
    throw error;
  }
  const normalizedDecision = clean(decision, 20).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
    const error = new Error("decision must be APPROVE or REJECT");
    error.status = 400;
    throw error;
  }
  if (normalizedDecision === "REJECT" && clean(notes, 1000).length < 3) {
    const error = new Error("Rejection reason required");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin.rpc("review_staff_work_permit_atomic", {
    p_organization_id: organizationId,
    p_document_id: documentId,
    p_manager_staff_id: manager.id,
    p_decision: normalizedDecision,
    p_notes: clean(notes, 1000) || null,
  });
  if (result.error) {
    const error = new Error(result.error.message || "Unable to review work permit");
    error.status = /already|newer|changed/i.test(result.error.message || "") ? 409 : 400;
    error.code = "STAFF_WORK_PERMIT_REVIEW_FAILED";
    throw error;
  }
  return result.data || null;
}

export async function listOrganizationWorkPermitCompliance({ organizationId, entityId = null } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  let query = supabaseAdmin.from("compliance_obligations")
    .select("id,entity_id,owner_staff_id,status,reference_number,effective_from,due_date,expiry_date,renewal_lead_days,enterprise_document_id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("source_type", WORK_PERMIT_OBLIGATION_SOURCE)
    .neq("status", "CANCELLED")
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (entityId) query = query.eq("entity_id", entityId);
  const obligations = await query;
  if (obligations.error) throw obligations.error;
  const rows = obligations.data || [];
  const staffIds = [...new Set(rows.map((row) => row.owner_staff_id).filter(Boolean))];
  const entityIds = [...new Set(rows.map((row) => row.entity_id).filter(Boolean))];
  const [staffResult, entityResult] = await Promise.all([
    staffIds.length ? supabaseAdmin.from("staff_accounts").select("id,name,email,role,position,department,party_id,active").in("id", staffIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabaseAdmin.from("legal_entities").select("id,legal_name,display_name,registration_number,country,is_active").in("id", entityIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (staffResult.error) throw staffResult.error;
  if (entityResult.error) throw entityResult.error;
  const staffById = new Map((staffResult.data || []).map((row) => [row.id, row]));
  const entityById = new Map((entityResult.data || []).map((row) => [row.id, row]));
  return rows.map((row) => {
    const remaining = daysUntil(row.expiry_date);
    return {
      obligationId: row.id,
      staff: staffById.get(row.owner_staff_id) || { id: row.owner_staff_id },
      legalEntity: entityById.get(row.entity_id) || { id: row.entity_id },
      documentId: row.enterprise_document_id,
      permitNumber: row.reference_number || null,
      effectiveFrom: row.effective_from || null,
      expiryDate: row.expiry_date || null,
      daysUntilExpiry: remaining,
      renewalLeadDays: row.renewal_lead_days,
      status: remaining !== null && remaining < 0 ? "EXPIRED" : remaining !== null && remaining <= Number(row.renewal_lead_days || DEFAULT_RENEWAL_LEAD_DAYS) ? "EXPIRING_SOON" : row.status,
      metadata: row.metadata || {},
      updatedAt: row.updated_at || null,
    };
  });
}

export { WORK_PERMIT_DOCUMENT_TYPE, WORK_PERMIT_OBLIGATION_SOURCE };
