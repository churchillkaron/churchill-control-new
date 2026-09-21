export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { getStaffIntakeAssignmentForReview } from "@/lib/people/intake/StaffIntakeReviewRuntime";
import { createDocumentSignedUrl } from "@/lib/documents/runtime/DocumentControlRuntime";

export async function GET(request, { params }) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const resolvedParams = await params;
    const assignmentId = String(resolvedParams?.assignmentId || "").trim();
    if (!assignmentId) return NextResponse.json({ success: false, error: "assignmentId required" }, { status: 400 });

    const assignment = await getStaffIntakeAssignmentForReview({ context, assignmentId });
    const signed = await createDocumentSignedUrl({
      organizationId: context.organizationId,
      documentId: assignment.enterprise_document_id,
      expiresIn: 180,
    });
    if (!signed?.url) throw new Error("Private intake preview could not be created");
    return NextResponse.redirect(signed.url, { status: 302 });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to preview intake document");
  }
}
