export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  decideDocumentApproval,
  requestDocumentApproval,
} from "@/lib/documents/runtime/DocumentControlRuntime";
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

    const action = clean(body.action || "request").toLowerCase();
    if (action === "request") {
      const result = await requestDocumentApproval({
        organizationId: context.organizationId,
        documentId,
        actor: context,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "approve" || action === "reject") {
      const result = await decideDocumentApproval({
        organizationId: context.organizationId,
        documentId,
        actor: context,
        decision: action.toUpperCase(),
        notes: body.notes || body.reason || null,
      });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json(
      { success: false, error: "action must be request, approve or reject" },
      { status: 400 },
    );
  } catch (error) {
    console.error("DOCUMENT_APPROVAL_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Document approval failed", code: error?.code || null },
      { status: error?.status || 500 },
    );
  }
}
