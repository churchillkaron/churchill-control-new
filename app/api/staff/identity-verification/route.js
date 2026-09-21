export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffIdentityVerification, uploadStaffIdentityDocument } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const identity = await loadStaffIdentityVerification({ organizationId: context.organizationId, staffId: context.staff.id });
    return NextResponse.json({ success: true, identity });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load identity verification");
  }
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const form = await request.formData();
    const identity = await uploadStaffIdentityDocument({
      organizationId: context.organizationId,
      staff: context.staff,
      file: form.get("file"),
      documentType: form.get("documentType") || form.get("document_type"),
    });
    return NextResponse.json({ success: true, identity }, { status: 201 });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to upload identity document");
  }
}
