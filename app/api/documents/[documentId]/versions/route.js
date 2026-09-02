export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { appendControlledDocumentVersion } from "@/lib/documents/runtime/DocumentControlRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

function clean(value) {
  return String(value ?? "").trim();
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const form = await request.formData();
    const organizationId = clean(form.get("organizationId") || form.get("organization_id"));
    const context = await resolveAuthenticatedStaffContext({ request, organizationId });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, error: "File required" }, { status: 400 });
    }

    const version = await appendControlledDocumentVersion({
      organizationId: context.organizationId,
      documentId,
      actor: context,
      file,
      changeSummary: clean(form.get("changeSummary") || form.get("change_summary")) || null,
      metadata: { upload_source: "documents_workspace" },
    });

    return NextResponse.json({ success: true, version }, { status: 201 });
  } catch (error) {
    console.error("DOCUMENT_VERSION_UPLOAD_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to add document version", code: error?.code || null },
      { status: error?.status || 500 },
    );
  }
}
