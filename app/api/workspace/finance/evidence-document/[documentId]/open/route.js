export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function clean(value) {
  return String(value ?? "").trim();
}

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const documentId = clean(resolved?.documentId);
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    if (!documentId) {
      return NextResponse.json({ success: false, error: "documentId is required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const signed = await createDocumentSignedUrl({
      organizationId: access.organizationId,
      documentId,
      expiresIn: 120,
    });
    if (!signed?.url) {
      return NextResponse.json({ success: false, error: "Unable to create evidence document URL" }, { status: 500 });
    }

    return NextResponse.redirect(signed.url, 307);
  } catch (error) {
    const message = error?.message || "Unable to open Finance evidence document";
    return NextResponse.json(
      { success: false, error: message },
      { status: /permission denied/i.test(message) ? 403 : error?.status || 500 },
    );
  }
}
