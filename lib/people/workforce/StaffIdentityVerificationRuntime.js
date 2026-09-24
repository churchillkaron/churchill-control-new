import { createControlledDocument, createDocumentSignedUrl, updateControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assertStaffUploadSignature } from "@/lib/people/security/StaffUploadSecurity";

const IDENTITY_DOCUMENT_TYPE = "STAFF_IDENTITY";
const ALLOWED_DOCUMENT_TYPES = new Set(["PASSPORT", "NATIONAL_ID", "GOVERNMENT_ID"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_IDENTITY_FILE_BYTES = 10 * 1024 * 1024;

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeType(value) {
  const type = clean(value, 40).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) {
    const error = new Error("Identity document must be PASSPORT, NATIONAL_ID or GOVERNMENT_ID");
    error.status = 400;
    error.code = "STAFF_IDENTITY_DOCUMENT_TYPE_INVALID";
    throw error;
  }
  return type;
}

function metadataOf(row) {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
}

function verificationOf(row) {
  const metadata = metadataOf(row);
  return metadata.identity_verification && typeof metadata.identity_verification === "object" ? metadata.identity_verification : {};
}

function maskedNumber(value) {
  const normalized = clean(value, 120).replace(/\s+/g, "");
  if (!normalized) return null;
  return `••••${normalized.slice(-4)}`;
}

function expired(expiryDate) {
  if (!expiryDate) return false;
  return String(expiryDate).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function publicStatus(row) {
  if (!row) return { status: "MISSING", verified: false, documentType: null, documentNumberMasked: null, submittedAt: null, verifiedAt: null, rejectedAt: null, rejectedReason: null, expiryDate: null };
  const verification = verificationOf(row);
  let status = clean(verification.status || "PENDING", 40).toUpperCase();
  if (status === "VERIFIED" && expired(row.expiry_date)) status = "EXPIRED";
  return {
    status,
    verified: status === "VERIFIED",
    documentType: clean(verification.document_type, 40).toUpperCase() || null,
    documentNumberMasked: clean(verification.document_number_masked, 40) || null,
    submittedAt: verification.submitted_at || row.created_at || null,
    verifiedAt: verification.verified_at || null,
    rejectedAt: verification.rejected_at || null,
    rejectedReason: clean(verification.rejected_reason, 1000) || null,
    expiryDate: row.expiry_date || null,
  };
}

async function latestIdentityDocument({ organizationId, staffId }) {
  const result = await supabaseAdmin.from("enterprise_documents")
    .select("id,organization_id,entity_id,document_name,document_type,document_status,classification,owner_staff_id,expiry_date,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("owner_staff_id", staffId)
    .eq("document_type", IDENTITY_DOCUMENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function loadStaffIdentityVerification({ organizationId, staffId } = {}) {
  if (!organizationId || !staffId) throw new Error("organizationId and staffId required");
  return publicStatus(await latestIdentityDocument({ organizationId, staffId }));
}

export async function requireVerifiedStaffIdentity({ organizationId, staffId } = {}) {
  const status = await loadStaffIdentityVerification({ organizationId, staffId });
  if (status.verified) return status;
  const messages = {
    MISSING: "Upload and verify your passport or government ID before starting a shift",
    PENDING: "Your passport or ID is waiting for verification before you can start a shift",
    REJECTED: "Your passport or ID verification was rejected. Upload a valid document before starting a shift",
    EXPIRED: "Your verified passport or ID has expired. Upload a current document before starting a shift",
  };
  const error = new Error(messages[status.status] || "Verified staff identity is required before starting a shift");
  error.status = 403;
  error.code = `CLOCK_IN_IDENTITY_${status.status || "REQUIRED"}`;
  error.identityVerification = status;
  throw error;
}

export async function uploadStaffIdentityDocument({ organizationId, staff, file, documentType } = {}) {
  if (!organizationId || !staff?.id) throw new Error("Authenticated staff context required");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Identity document file required");
  const mimeType = clean(file.type, 120).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    const error = new Error("Identity document must be JPEG, PNG, WebP or PDF");
    error.status = 400;
    throw error;
  }
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_IDENTITY_FILE_BYTES) {
    const error = new Error("Identity document must be 10 MB or smaller");
    error.status = 400;
    throw error;
  }
  await assertStaffUploadSignature(file, { allowedMimeTypes: ALLOWED_MIME_TYPES });
  const normalizedType = normalizeType(documentType);
  const now = new Date().toISOString();
  const created = await createControlledDocument({
    organizationId,
    actor: { staff },
    file,
    documentName: `${normalizedType === "PASSPORT" ? "Passport" : "Government ID"} · ${staff.name || staff.email || "Staff"}`,
    documentType: IDENTITY_DOCUMENT_TYPE,
    classification: "RESTRICTED",
    ownerStaffId: staff.id,
    referenceType: "STAFF",
    referenceId: staff.id,
    tags: ["staff-identity", normalizedType.toLowerCase()],
    metadata: { identity_verification: { status: "PENDING", document_type: normalizedType, submitted_at: now, submitted_by_staff_id: staff.id } },
  });
  const documentId = created?.document?.id || created?.id;
  if (!documentId) throw new Error("Identity document could not be created");
  await updateControlledDocument({ organizationId, documentId, actor: { staff }, patch: { status: "pending_approval" } });
  return loadStaffIdentityVerification({ organizationId, staffId: staff.id });
}

export async function loadIdentityVerificationQueue({ organizationId } = {}) {
  const result = await supabaseAdmin.from("enterprise_documents")
    .select("id,owner_staff_id,document_name,document_status,expiry_date,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("document_type", IDENTITY_DOCUMENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (result.error) throw result.error;
  const staffIds = [...new Set((result.data || []).map((row) => row.owner_staff_id).filter(Boolean))];
  const memberships = staffIds.length
    ? await supabaseAdmin
        .from("organization_users")
        .select("staff_account_id,role,status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .in("staff_account_id", staffIds)
    : { data: [], error: null };
  if (memberships.error) throw memberships.error;
  const membershipByStaffId = new Map(
    (memberships.data || []).map((row) => [String(row.staff_account_id), row])
  );
  const memberStaffIds = [...membershipByStaffId.keys()];
  const staffResult = memberStaffIds.length
    ? await supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,active")
        .eq("active", true)
        .in("id", memberStaffIds)
    : { data: [], error: null };
  if (staffResult.error) throw staffResult.error;
  const staffById = new Map(
    (staffResult.data || []).map((row) => {
      const membership = membershipByStaffId.get(String(row.id));
      return [row.id, { ...row, role: membership?.role || row.role, organization_role: membership?.role || row.role || null }];
    })
  );
  return (result.data || []).map((row) => ({
    documentId: row.id,
    ...publicStatus(row),
    staff: staffById.get(row.owner_staff_id) || { id: row.owner_staff_id },
    documentStatus: row.document_status || null,
  }));
}

export async function createIdentityReviewSignedUrl({ organizationId, documentId } = {}) {
  const document = await supabaseAdmin.from("enterprise_documents")
    .select("id,document_type")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("document_type", IDENTITY_DOCUMENT_TYPE)
    .maybeSingle();
  if (document.error) throw document.error;
  if (!document.data) { const error = new Error("Identity document not found"); error.status = 404; throw error; }
  return createDocumentSignedUrl({ organizationId, documentId, expiresIn: 180 });
}

export async function reviewStaffIdentityDocument({ organizationId, manager, documentId, decision, documentNumber = null, expiryDate = null, notes = null } = {}) {
  const rowResult = await supabaseAdmin.from("enterprise_documents")
    .select("id,owner_staff_id,document_type,document_status,expiry_date,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("document_type", IDENTITY_DOCUMENT_TYPE)
    .maybeSingle();
  if (rowResult.error) throw rowResult.error;
  if (!rowResult.data) { const error = new Error("Identity document not found"); error.status = 404; throw error; }
  const normalizedDecision = clean(decision, 20).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalizedDecision)) { const error = new Error("decision must be APPROVE or REJECT"); error.status = 400; throw error; }
  const currentVerification = verificationOf(rowResult.data);
  if (clean(currentVerification.status || "PENDING", 40).toUpperCase() !== "PENDING" || clean(rowResult.data.document_status, 80).toLowerCase() !== "pending_approval") {
    const error = new Error("Identity document has already been reviewed");
    error.status = 409;
    error.code = "STAFF_IDENTITY_REVIEW_STATE_CONFLICT";
    throw error;
  }
  const latest = await latestIdentityDocument({ organizationId, staffId: rowResult.data.owner_staff_id });
  if (!latest?.id || latest.id !== rowResult.data.id) {
    const error = new Error("A newer identity document exists. Review the latest submission instead.");
    error.status = 409;
    error.code = "STAFF_IDENTITY_REVIEW_SUPERSEDED";
    throw error;
  }
  const now = new Date().toISOString();
  const documentType = normalizeType(currentVerification.document_type);
  if (normalizedDecision === "APPROVE") {
    const number = clean(documentNumber, 120).replace(/\s+/g, "");
    if (number.length < 4) { const error = new Error("Verified document number is required when approving identity"); error.status = 400; error.code = "STAFF_IDENTITY_DOCUMENT_NUMBER_REQUIRED"; throw error; }
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(clean(expiryDate, 20))) { const error = new Error("expiryDate must use YYYY-MM-DD"); error.status = 400; throw error; }
    if (expiryDate && clean(expiryDate, 20) < new Date().toISOString().slice(0, 10)) {
      const error = new Error("Expired identity document cannot be approved as current");
      error.status = 400;
      error.code = "STAFF_IDENTITY_EXPIRY_INVALID";
      throw error;
    }
    await updateControlledDocument({
      organizationId,
      documentId,
      actor: { staff: manager },
      expectedStatus: "pending_approval",
      expectedUpdatedAt: rowResult.data.updated_at,
      patch: { status: "active", expiryDate: expiryDate || null, metadata: { identity_verification: { status: "VERIFIED", document_type: documentType, document_number_masked: maskedNumber(number), verified_at: now, verified_by_staff_id: manager?.id || null, reviewer_notes: clean(notes, 1000) || null } } },
    });
  } else {
    const reason = clean(notes, 1000);
    if (reason.length < 3) { const error = new Error("Rejection reason required"); error.status = 400; throw error; }
    await updateControlledDocument({
      organizationId,
      documentId,
      actor: { staff: manager },
      expectedStatus: "pending_approval",
      expectedUpdatedAt: rowResult.data.updated_at,
      patch: { status: "archived", metadata: { identity_verification: { status: "REJECTED", document_type: documentType, rejected_at: now, rejected_by_staff_id: manager?.id || null, rejected_reason: reason } } },
    });
  }
  return loadStaffIdentityVerification({ organizationId, staffId: rowResult.data.owner_staff_id });
}

export { IDENTITY_DOCUMENT_TYPE };
