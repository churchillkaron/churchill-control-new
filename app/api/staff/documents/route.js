export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_REFERENCE_TYPES = ["STAFF", "STAFF_ACCOUNT", "EMPLOYEE", "EMPLOYMENT"];
const PARTY_REFERENCE_TYPES = ["PARTY", "PERSON", "EMPLOYEE_PARTY"];

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({
        success: false,
        error: context.error,
        code: context.code,
        availableOrganizationIds: context.availableOrganizationIds || [],
      }, { status: context.status || 403 });
    }

    const staffId = context.staff.id;
    const partyId = context.staff.party_id || null;
    const [ownedResult, staffLinksResult, partyLinksResult, signatureResult] = await Promise.all([
      supabaseAdmin.from("enterprise_documents")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("owner_staff_id", staffId)
        .limit(500),
      supabaseAdmin.from("enterprise_document_links")
        .select("enterprise_document_id")
        .eq("organization_id", context.organizationId)
        .eq("reference_id", staffId)
        .in("reference_type", STAFF_REFERENCE_TYPES)
        .limit(500),
      partyId
        ? supabaseAdmin.from("enterprise_document_links")
            .select("enterprise_document_id")
            .eq("organization_id", context.organizationId)
            .eq("reference_id", partyId)
            .in("reference_type", PARTY_REFERENCE_TYPES)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      partyId
        ? supabaseAdmin.from("document_signature_requests")
            .select("enterprise_document_id,status,expires_at")
            .eq("organization_id", context.organizationId)
            .eq("signer_party_id", partyId)
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [ownedResult, staffLinksResult, partyLinksResult, signatureResult]) {
      if (result.error) throw result.error;
    }

    const now = Date.now();
    const signerDocumentIds = (signatureResult.data || [])
      .filter((row) => {
        const status = String(row.status || "").trim().toUpperCase();
        const expires = row.expires_at ? new Date(row.expires_at).getTime() : null;
        return !["CANCELLED", "VOID", "EXPIRED"].includes(status) && (!expires || expires > now);
      })
      .map((row) => row.enterprise_document_id);

    const documentIds = unique([
      ...(ownedResult.data || []).map((row) => row.id),
      ...(staffLinksResult.data || []).map((row) => row.enterprise_document_id),
      ...(partyLinksResult.data || []).map((row) => row.enterprise_document_id),
      ...signerDocumentIds,
    ]);

    if (!documentIds.length) {
      return NextResponse.json({
        success: true,
        documents: [],
      });
    }

    const documentsResult = await supabaseAdmin.from("enterprise_documents")
      .select("id,document_type,document_name,document_status,classification,version_number,mime_type,file_size_bytes,updated_at")
      .eq("organization_id", context.organizationId)
      .in("id", documentIds)
      .not("document_status", "in", "(archived,deleted,void)")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (documentsResult.error) throw documentsResult.error;

    return NextResponse.json({
      success: true,
      documents: documentsResult.data || [],
    });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load staff documents");
  }
}
