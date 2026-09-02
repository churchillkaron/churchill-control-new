export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { updateControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { loadDocumentDetail } from "@/lib/documents/runtime/DocumentLibraryRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

function clean(value) {
  return String(value ?? "").trim();
}

async function resolveContext(request, organizationId) {
  return resolveAuthenticatedStaffContext({ request, organizationId });
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const context = await resolveContext(request, organizationId);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const detail = await loadDocumentDetail({
      organizationId: context.organizationId,
      documentId,
    });
    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Controlled document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    console.error("DOCUMENT_DETAIL_GET_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load document" },
      { status: error?.status || 500 },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const context = await resolveContext(request, organizationId);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const document = await updateControlledDocument({
      organizationId: context.organizationId,
      documentId,
      actor: context,
      patch: body,
    });

    return NextResponse.json({ success: true, document });
  } catch (error) {
    console.error("DOCUMENT_DETAIL_PATCH_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update document", code: error?.code || null },
      { status: error?.status || 500 },
    );
  }
}
