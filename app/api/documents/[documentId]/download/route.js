export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import { recordDocumentAccess } from "@/lib/documents/runtime/DocumentLibraryRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { resolveStaffPortalEffectivePermissions } from "@/lib/people/portal/StaffPortalPermissionRuntime";
import { resolveDocumentReadAccess } from "@/lib/documents/security/DocumentReadAccessPolicy";

function clean(value) {
  return String(value ?? "").trim();
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const context = await resolveAuthenticatedStaffContext({ request, organizationId });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const effectiveAccess = await resolveStaffPortalEffectivePermissions({
      organizationId: context.organizationId,
      userId: context.user?.id || null,
      role: context.role,
      basePermissions: context.permissions || [],
    });
    const documentAccess = await resolveDocumentReadAccess({
      organizationId: context.organizationId,
      documentId,
      staffId: context.staff.id,
      partyId: context.staff.party_id || null,
      role: context.role,
      permissions: effectiveAccess.permissions,
    });
    if (!documentAccess.allowed) {
      const status = documentAccess.reason === "DOCUMENT_NOT_FOUND" ? 404 : 403;
      return NextResponse.json(
        { success: false, error: status === 404 ? "Document not found" : "Document access denied" },
        { status },
      );
    }

    const versionValue = clean(
      url.searchParams.get("versionNumber") || url.searchParams.get("version"),
    );
    const requestedExpiry = Number(url.searchParams.get("expiresIn") || 300);
    const expiresIn = Number.isFinite(requestedExpiry)
      ? Math.max(60, Math.min(Math.trunc(requestedExpiry), 900))
      : 300;
    const signed = await createDocumentSignedUrl({
      organizationId: context.organizationId,
      documentId,
      versionNumber: versionValue ? Number(versionValue) : null,
      expiresIn,
    });

    await recordDocumentAccess({
      organizationId: context.organizationId,
      documentId,
      actorId: context.staff?.id || null,
      accessType: "DOWNLOAD",
      metadata: {
        version_number: signed.version_number,
        access_reason: documentAccess.reason,
      },
    }).catch(() => null);

    const redirect = ["1", "true", "yes"].includes(clean(url.searchParams.get("redirect")).toLowerCase());
    if (redirect && signed?.url) return NextResponse.redirect(signed.url, 307);

    return NextResponse.json({ success: true, ...signed });
  } catch (error) {
    console.error("DOCUMENT_DOWNLOAD_URL_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create document download" },
      { status: error?.status || 500 },
    );
  }
}
