export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

function text(value) {
  return String(value ?? "").trim();
}

function tagsFrom(value) {
  return text(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const organizationId = text(form.get("organizationId") || form.get("organization_id"));

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId,
    });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "File required" },
        { status: 400 },
      );
    }

    const document = await createControlledDocument({
      organizationId: context.organizationId,
      entityId: text(form.get("entityId") || form.get("entity_id")) || null,
      actor: context,
      file,
      documentName: text(form.get("documentName") || form.get("document_name")) || file.name,
      documentType: text(form.get("documentType") || form.get("document_type")) || "FILE",
      documentNumber: text(form.get("documentNumber") || form.get("document_number")) || null,
      classification: text(form.get("classification")) || "INTERNAL",
      ownerStaffId: text(form.get("ownerStaffId") || form.get("owner_staff_id")) || null,
      effectiveDate: text(form.get("effectiveDate") || form.get("effective_date")) || null,
      expiryDate: text(form.get("expiryDate") || form.get("expiry_date")) || null,
      reviewDueAt: text(form.get("reviewDueAt") || form.get("review_due_at")) || null,
      retentionUntil: text(form.get("retentionUntil") || form.get("retention_until")) || null,
      referenceType: text(form.get("referenceType") || form.get("reference_type")) || null,
      referenceId: text(form.get("referenceId") || form.get("reference_id")) || null,
      sourceOrganizationDocumentId:
        text(form.get("sourceOrganizationDocumentId") || form.get("source_organization_document_id")) || null,
      tags: tagsFrom(form.get("tags")),
      metadata: {
        upload_source: "documents_workspace",
      },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("DOCUMENT_UPLOAD_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Document upload failed", code: error?.code || null },
      { status: error?.status || 500 },
    );
  }
}
