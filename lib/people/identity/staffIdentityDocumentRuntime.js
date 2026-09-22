import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const STAFF_IDENTITY_DOCUMENT_TYPES = Object.freeze({
  passport: "STAFF_PASSPORT",
  national_id: "STAFF_NATIONAL_ID",
  work_permit: "STAFF_WORK_PERMIT",
});

const VERIFIED_STATUSES = new Set(["approved", "active"]);
const PENDING_STATUSES = new Set(["draft", "review", "pending_approval"]);

function clean(value) {
  return String(value ?? "").trim();
}

function daysUntil(dateValue, today = new Date()) {
  if (!dateValue) return null;
  const end = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

export function staffIdentityExpiryState(expiryDate, today = new Date()) {
  const days = daysUntil(expiryDate, today);
  if (days === null) return { state: "NO_EXPIRY", days_remaining: null, severity: "info" };
  if (days < 0) return { state: "EXPIRED", days_remaining: days, severity: "critical" };
  if (days <= 7) return { state: "EXPIRING_7", days_remaining: days, severity: "critical" };
  if (days <= 14) return { state: "EXPIRING_14", days_remaining: days, severity: "high" };
  if (days <= 30) return { state: "EXPIRING_30", days_remaining: days, severity: "high" };
  if (days <= 60) return { state: "EXPIRING_60", days_remaining: days, severity: "medium" };
  if (days <= 90) return { state: "EXPIRING_90", days_remaining: days, severity: "medium" };
  return { state: "VALID", days_remaining: days, severity: "ok" };
}

function normalizeDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    document_type: row.document_type,
    document_name: row.document_name,
    document_number: row.document_number || null,
    entity_id: row.entity_id || null,
    status: row.document_status || null,
    effective_date: row.effective_date || null,
    expiry_date: row.expiry_date || null,
    version_number: Number(row.version_number || 1),
    classification: row.classification || null,
    updated_at: row.updated_at || row.created_at || null,
    verification: VERIFIED_STATUSES.has(String(row.document_status || "").toLowerCase())
      ? "VERIFIED"
      : PENDING_STATUSES.has(String(row.document_status || "").toLowerCase())
        ? "PENDING"
        : "UNVERIFIED",
    expiry: staffIdentityExpiryState(row.expiry_date),
  };
}

export async function loadStaffIdentityDocumentStatus({
  organizationId,
  staffId,
  currentEntityId = null,
} = {}) {
  const organization_id = clean(organizationId);
  const staff_id = clean(staffId);
  if (!organization_id || !staff_id) throw new Error("organizationId and staffId required");

  const types = Object.values(STAFF_IDENTITY_DOCUMENT_TYPES);
  const query = await supabaseAdmin
    .from("enterprise_documents")
    .select("id,organization_id,entity_id,document_type,document_name,document_number,document_status,classification,owner_staff_id,effective_date,expiry_date,version_number,created_at,updated_at")
    .eq("organization_id", organization_id)
    .eq("owner_staff_id", staff_id)
    .in("document_type", types)
    .order("updated_at", { ascending: false });

  if (query.error) throw query.error;
  const rows = query.data || [];

  function typeStatus(documentType, { entitySpecific = false } = {}) {
    const candidates = rows.filter((row) =>
      row.document_type === documentType &&
      (!entitySpecific || !currentEntityId || row.entity_id === currentEntityId)
    );
    const verified = candidates.find((row) =>
      VERIFIED_STATUSES.has(String(row.document_status || "").toLowerCase())
    ) || null;
    const pending = candidates.find((row) =>
      PENDING_STATUSES.has(String(row.document_status || "").toLowerCase())
    ) || null;
    const current = normalizeDocument(verified || pending || candidates[0] || null);

    return {
      current,
      verified: normalizeDocument(verified),
      pending_replacement: pending && pending.id !== verified?.id ? normalizeDocument(pending) : null,
      history_count: candidates.length,
      required: false,
    };
  }

  const passport = typeStatus(STAFF_IDENTITY_DOCUMENT_TYPES.passport);
  const nationalId = typeStatus(STAFF_IDENTITY_DOCUMENT_TYPES.national_id);
  const workPermit = typeStatus(STAFF_IDENTITY_DOCUMENT_TYPES.work_permit, { entitySpecific: true });

  const attention = [];
  const identityVerified = Boolean(passport.verified || nationalId.verified);
  const identityPending = Boolean(
    passport.pending_replacement ||
    nationalId.pending_replacement ||
    passport.current?.verification === "PENDING" ||
    nationalId.current?.verification === "PENDING"
  );

  if (!identityVerified) {
    attention.push({
      key: "identity_document",
      label: "Passport or National ID",
      state: identityPending ? "PENDING_VERIFICATION" : "MISSING",
      severity: identityPending ? "medium" : "high",
      days_remaining: null,
    });
  }

  for (const [key, label, entry] of [
    ["passport", "Passport", passport],
    ["national_id", "National ID", nationalId],
    ["work_permit", "Work permit", workPermit],
  ]) {
    const doc = entry.verified || entry.current;
    if (!doc) continue;
    if (doc.verification !== "VERIFIED") {
      attention.push({ key, label, state: "PENDING_VERIFICATION", severity: "medium", days_remaining: doc.expiry?.days_remaining ?? null });
      continue;
    }
    if (["EXPIRED", "EXPIRING_7", "EXPIRING_14", "EXPIRING_30", "EXPIRING_60", "EXPIRING_90"].includes(doc.expiry?.state)) {
      attention.push({
        key,
        label,
        state: doc.expiry.state,
        severity: doc.expiry.severity,
        days_remaining: doc.expiry.days_remaining,
        expiry_date: doc.expiry_date,
      });
    }
  }

  return {
    passport,
    national_id: nationalId,
    work_permit: workPermit,
    current_entity_id: currentEntityId || null,
    attention,
    has_critical: attention.some((item) => item.severity === "critical"),
    has_attention: attention.length > 0,
  };
}

export default Object.freeze({
  STAFF_IDENTITY_DOCUMENT_TYPES,
  staffIdentityExpiryState,
  loadStaffIdentityDocumentStatus,
});
