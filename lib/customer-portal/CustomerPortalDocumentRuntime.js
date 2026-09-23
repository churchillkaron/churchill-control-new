import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CUSTOMER_RELATIONS = new Set(["CUSTOMER_VISIBLE", "CUSTOMER_SIGNATURE", "CUSTOMER_DOCUMENT"]);

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

export async function listCustomerPortalDocuments({ organizationId, partyId } = {}) {
  if (!organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_SCOPE_REQUIRED");

  const [linksResult, signaturesResult] = await Promise.all([
    supabaseAdmin.from("enterprise_document_links")
      .select("enterprise_document_id,reference_type,reference_id,relation_type,created_at")
      .eq("organization_id", organizationId)
      .eq("reference_id", partyId)
      .eq("reference_type", "PARTY")
      .in("relation_type", [...CUSTOMER_RELATIONS]),
    supabaseAdmin.from("document_signature_requests")
      .select("enterprise_document_id,status,expires_at,created_at")
      .eq("organization_id", organizationId)
      .eq("signer_party_id", partyId),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (signaturesResult.error) throw signaturesResult.error;

  const now = Date.now();
  const allowedIds = new Set((linksResult.data || []).map((row) => row.enterprise_document_id).filter(Boolean));
  for (const request of signaturesResult.data || []) {
    const status = normalize(request.status);
    const expires = request.expires_at ? Date.parse(request.expires_at) : null;
    if (["CANCELLED", "VOID", "EXPIRED"].includes(status)) continue;
    if (expires && Number.isFinite(expires) && expires <= now) continue;
    if (request.enterprise_document_id) allowedIds.add(request.enterprise_document_id);
  }
  if (!allowedIds.size) return [];

  const documents = await supabaseAdmin.from("enterprise_documents")
    .select("id,entity_id,document_type,document_name,document_number,document_status,classification,version_number,mime_type,file_size_bytes,effective_date,expiry_date,created_at,updated_at")
    .eq("organization_id", organizationId)
    .in("id", [...allowedIds])
    .order("updated_at", { ascending: false });
  if (documents.error) throw documents.error;

  return (documents.data || [])
    .filter((document) => !["ARCHIVED", "OBSOLETE", "SUPERSEDED", "VOID"].includes(normalize(document.document_status)))
    .map((document) => ({
      ...document,
      customer_visible: true,
    }));
}

export async function resolveCustomerPortalDocumentAccess({ organizationId, partyId, documentId } = {}) {
  if (!organizationId || !partyId || !documentId) return { allowed: false, reason: "DOCUMENT_ACCESS_CONTEXT_REQUIRED" };
  const documents = await listCustomerPortalDocuments({ organizationId, partyId });
  const document = documents.find((row) => row.id === documentId) || null;
  return document
    ? { allowed: true, reason: "CUSTOMER_EXPLICIT_DOCUMENT_RELATION", document }
    : { allowed: false, reason: "DOCUMENT_ACCESS_DENIED", document: null };
}

export default Object.freeze({
  list: listCustomerPortalDocuments,
  resolve: resolveCustomerPortalDocumentAccess,
});
