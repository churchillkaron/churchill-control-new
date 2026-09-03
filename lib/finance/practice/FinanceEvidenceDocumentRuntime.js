import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeControlled(row) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    entity_id: row.entity_id || null,
    file_name: row.document_name || "Controlled document",
    mime_type: row.mime_type || null,
    status: row.document_status || "draft",
    approval_required: row.metadata?.approval_required === true,
    approved_at: row.approved_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    classification: row.classification || "INTERNAL",
    version_number: Number(row.version_number || 1),
    checksum_sha256: row.checksum_sha256 || null,
    source: "CONTROLLED",
    controlled: true,
    file_url: `/api/documents/${row.id}/download?organizationId=${encodeURIComponent(row.organization_id)}`,
  };
}

function normalizeLegacy(row) {
  if (!row) return null;
  return {
    ...row,
    source: "LEGACY",
    controlled: false,
    entity_id: null,
    classification: null,
    version_number: 1,
    checksum_sha256: null,
  };
}

export async function getFinanceEvidenceDocument({ organizationId, documentId }) {
  const orgId = clean(organizationId);
  const id = clean(documentId);
  if (!orgId || !id) return null;

  const { data: controlled, error: controlledError } = await supabaseAdmin
    .from("enterprise_documents")
    .select("id,organization_id,entity_id,document_name,document_status,mime_type,version_number,classification,checksum_sha256,approved_at,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (controlledError) throw controlledError;
  if (controlled) return normalizeControlled(controlled);

  const { data: legacy, error: legacyError } = await supabaseAdmin
    .from("organization_documents")
    .select("id,organization_id,file_name,file_url,mime_type,status,approval_required,approved_at,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (legacyError) throw legacyError;
  return normalizeLegacy(legacy);
}

export async function listFinanceEvidenceDocuments({ organizationId, entityId = null, limit = 200 }) {
  const orgId = clean(organizationId);
  if (!orgId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));

  let controlledQuery = supabaseAdmin
    .from("enterprise_documents")
    .select("id,organization_id,entity_id,document_name,document_status,mime_type,version_number,classification,checksum_sha256,approved_at,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (entityId) controlledQuery = controlledQuery.or(`entity_id.is.null,entity_id.eq.${clean(entityId)}`);

  const [controlledResult, legacyResult] = await Promise.all([
    controlledQuery,
    supabaseAdmin
      .from("organization_documents")
      .select("id,organization_id,file_name,file_url,mime_type,status,approval_required,approved_at,created_at,updated_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(safeLimit),
  ]);
  if (controlledResult.error) throw controlledResult.error;
  if (legacyResult.error) throw legacyResult.error;

  const documents = [
    ...(controlledResult.data || []).map(normalizeControlled),
    ...(legacyResult.data || []).map(normalizeLegacy),
  ];
  const seen = new Set();
  return documents
    .filter((document) => {
      if (!document?.id || seen.has(document.id)) return false;
      seen.add(document.id);
      return true;
    })
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, safeLimit);
}

export function isControlledFinanceEvidenceDocument(document) {
  return document?.controlled === true || document?.source === "CONTROLLED";
}
