export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import { CUSTOMER_PORTAL_COOKIE, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";
import { resolveCustomerPortalDocumentAccess } from "@/lib/customer-portal/CustomerPortalDocumentRuntime";

function clean(value) {
  return String(value ?? "").trim();
}

export async function GET(request, { params }) {
  try {
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const access = await resolveCustomerPortalDocumentAccess({
      organizationId: session.organization_id,
      partyId: session.party_id,
      documentId,
    });
    if (!access.allowed) return NextResponse.json({ success: false, error: "Document access denied" }, { status: 403 });

    const url = new URL(request.url);
    const signed = await createDocumentSignedUrl({
      organizationId: session.organization_id,
      documentId,
      versionNumber: access.document?.version_number || null,
      expiresIn: Math.min(300, Math.max(30, Number(url.searchParams.get("expiresIn") || 120))),
    });
    const redirect = ["1", "true", "yes"].includes(clean(url.searchParams.get("redirect")).toLowerCase());
    if (redirect && signed?.url) return NextResponse.redirect(signed.url, 307);
    return NextResponse.json({ success: true, ...signed });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to create document download" }, { status: 500 });
  }
}
