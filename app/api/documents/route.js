export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { loadDocumentLibrary } from "@/lib/documents/runtime/DocumentLibraryRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function clean(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const result = await loadDocumentLibrary({
      organizationId: access.organizationId,
      entityId: clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id")) || null,
      query: clean(url.searchParams.get("q")),
      status: clean(url.searchParams.get("status")),
      type: clean(url.searchParams.get("type")),
      source: clean(url.searchParams.get("source")),
      limit: Number(url.searchParams.get("limit") || 500),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("DOCUMENT_LIBRARY_API_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load documents" },
      { status: error?.status || 500 },
    );
  }
}
