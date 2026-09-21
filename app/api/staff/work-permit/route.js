export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffWorkPermit, uploadStaffWorkPermit } from "@/lib/people/workforce/StaffWorkPermitRuntime";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const workPermit = await loadStaffWorkPermit({ organizationId: context.organizationId, staffId: context.staff.id });
    return NextResponse.json({ success: true, workPermit });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load work permit");
  }
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const form = await request.formData();
    const workPermit = await uploadStaffWorkPermit({
      organizationId: context.organizationId,
      staff: context.staff,
      file: form.get("file"),
      expiryDate: form.get("expiryDate") || form.get("expiry_date") || null,
      permitNumber: form.get("permitNumber") || form.get("permit_number") || null,
    });
    return NextResponse.json({ success: true, workPermit }, { status: 201 });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to upload work permit");
  }
}
