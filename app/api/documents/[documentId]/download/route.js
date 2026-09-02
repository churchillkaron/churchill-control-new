export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";
import { recordDocumentAccess } from "@/lib/documents/runtime/DocumentLibraryRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

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

    const versionValue = clean(url.searchParams.get("version"));
    const signed = await createDocumentSignedUrl({
      organizationId: context.organizationId,
      documentId,
      versionNumber: versionValue ? Number(versionValue) : null,
      expiresIn: Number(url.searchParams.get("expiresIn") || 300),
    });

    await recordDocumentAccess({
      organizationId: context.organizationId,
      documentId,
      actorId: context.staff?.id || null,
      accessType: "DOWNLOAD",
      metadata: { version_number: signed.version_number },
    }).catch(() => null);

    return NextResponse.json({ success: true, ...signed });
  } catch (error) {
    console.error("DOCUMENT_DOWNLOAD_URL_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create document download" },
      { status: error?.status || 500 },
    );
  }
}
