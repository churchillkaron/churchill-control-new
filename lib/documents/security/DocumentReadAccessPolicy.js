import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
]);

const STAFF_REFERENCE_TYPES = new Set([
  "STAFF",
  "STAFF_ACCOUNT",
  "EMPLOYEE",
  "EMPLOYMENT",
]);
const PARTY_REFERENCE_TYPES = new Set([
  "PARTY",
  "PERSON",
  "EMPLOYEE_PARTY",
]);

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function permissionMatches(granted, required) {
  const actual = String(granted || "").trim().toLowerCase();
  const expected = String(required || "").trim().toLowerCase();
  if (!actual || !expected) return false;
  if (actual === "*" || actual === expected) return true;
  if (actual.endsWith(".*")) return expected.startsWith(actual.slice(0, -1));
  return false;
}

function hasDocumentWorkspacePermission(permissions = []) {
  const required = [
    "documents.view",
    "documents.manage",
    "documents.*",
    "document.view",
    "document.manage",
    "document.*",
  ];
  return permissions.some((granted) => required.some((candidate) => permissionMatches(granted, candidate)));
}

export async function resolveDocumentReadAccess({
  organizationId,
  documentId,
  staffId,
  partyId = null,
  role = null,
  permissions = [],
} = {}) {
  if (!organizationId || !documentId || !staffId) {
    return { allowed: false, reason: "DOCUMENT_ACCESS_CONTEXT_REQUIRED", document: null };
  }

  const documentResult = await supabaseAdmin.from("enterprise_documents")
    .select("id,organization_id,entity_id,document_name,document_type,document_status,classification,owner_staff_id,created_by,storage_path,version_number,mime_type,file_size_bytes,effective_date,expiry_date,metadata")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (documentResult.error) throw documentResult.error;
  const document = documentResult.data || null;
  if (!document) return { allowed: false, reason: "DOCUMENT_NOT_FOUND", document: null };

  const normalizedRole = normalize(role);
  if (FULL_ACCESS_ROLES.has(normalizedRole) || hasDocumentWorkspacePermission(permissions)) {
    return { allowed: true, reason: "DOCUMENT_WORKSPACE_AUTHORITY", document };
  }
  if (document.owner_staff_id === staffId) {
    return { allowed: true, reason: "DOCUMENT_OWNER", document };
  }

  const referenceIds = [staffId, partyId].filter(Boolean);
  if (referenceIds.length) {
    const linkResult = await supabaseAdmin.from("enterprise_document_links")
      .select("reference_type,reference_id,relation_type")
      .eq("organization_id", organizationId)
      .eq("enterprise_document_id", documentId)
      .in("reference_id", referenceIds)
      .limit(50);
    if (linkResult.error) throw linkResult.error;
    const linked = (linkResult.data || []).some((link) => {
      const type = normalize(link.reference_type);
      if (link.reference_id === staffId && STAFF_REFERENCE_TYPES.has(type)) return true;
      if (partyId && link.reference_id === partyId && PARTY_REFERENCE_TYPES.has(type)) return true;
      return false;
    });
    if (linked) return { allowed: true, reason: "DOCUMENT_EXPLICIT_LINK", document };
  }

  if (partyId) {
    const signatureResult = await supabaseAdmin.from("document_signature_requests")
      .select("id,status,expires_at")
      .eq("organization_id", organizationId)
      .eq("enterprise_document_id", documentId)
      .eq("signer_party_id", partyId)
      .limit(10);
    if (signatureResult.error) throw signatureResult.error;
    const now = Date.now();
    const signer = (signatureResult.data || []).some((request) => {
      const status = normalize(request.status);
      const expires = request.expires_at ? new Date(request.expires_at).getTime() : null;
      return !["CANCELLED", "VOID", "EXPIRED"].includes(status) && (!expires || expires > now);
    });
    if (signer) return { allowed: true, reason: "DOCUMENT_SIGNER", document };
  }

  return { allowed: false, reason: "DOCUMENT_ACCESS_DENIED", document };
}

export default Object.freeze({ resolve: resolveDocumentReadAccess });
