export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { linkControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

function clean(value) {
  return String(value ?? "").trim();
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const documentId = clean(resolvedParams?.documentId);
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const context = await resolveAuthenticatedStaffContext({ request, organizationId });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const link = await linkControlledDocument({
      organizationId: context.organizationId,
      documentId,
      entityId: body.entityId || body.entity_id || null,
      actor: context,
      referenceType: body.referenceType || body.reference_type,
      referenceId: body.referenceId || body.reference_id,
      relationType: body.relationType || body.relation_type || "RELATED",
    });

    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (error) {
    console.error("DOCUMENT_LINK_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to link document", code: error?.code || null },
      { status: error?.status || 500 },
    );
  }
}
