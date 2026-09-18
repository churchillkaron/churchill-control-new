export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import { resolveFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const token = clean(resolved?.token);
    const documentId = clean(resolved?.documentId);
    if (!documentId) return jsonError("documentId is required");
    const grant = await resolveFinanceClientPortalGrant(token, { markViewed: true });
    if (!grant) return jsonError("This accounting client portal link is invalid or expired", 404);

    const [contractResult, evidenceResult] = await Promise.all([
      supabaseAdmin.from("enterprise_document_links").select("enterprise_document_id").eq("organization_id", grant.accounting_firm_id).eq("enterprise_document_id", documentId).eq("reference_type", "ACCOUNTING_ENGAGEMENT").eq("reference_id", grant.engagement_id).eq("relation_type", "CONTRACT").limit(1).maybeSingle(),
      supabaseAdmin.from("accounting_work_program_evidence_links").select("document_id").eq("accounting_firm_id", grant.accounting_firm_id).eq("engagement_id", grant.engagement_id).eq("organization_id", grant.organization_id).eq("document_id", documentId).eq("status", "ACTIVE").limit(1).maybeSingle(),
    ]);
    if (contractResult.error) throw contractResult.error;
    if (evidenceResult.error) throw evidenceResult.error;
    const sourceOrganizationId = contractResult.data ? grant.accounting_firm_id : evidenceResult.data ? grant.organization_id : null;
    if (!sourceOrganizationId) return jsonError("Document is outside this client portal engagement", 404);
    const signed = await createDocumentSignedUrl({ organizationId: sourceOrganizationId, documentId, expiresIn: 120 });
    if (!signed?.url) return jsonError("Unable to open document", 500);
    return NextResponse.redirect(signed.url, 307);
  } catch (error) {
    return jsonError(error?.message || "Unable to open client portal document", /not found/i.test(error?.message || "") ? 404 : 500);
  }
}
