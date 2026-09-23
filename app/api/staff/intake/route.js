export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { listStaffIntakeAssignments, updateStaffIntakeAssignment } from "@/lib/people/intake/StaffIntakeReviewRuntime";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const assignments = await listStaffIntakeAssignments({ context });
    return NextResponse.json({ success: true, assignments });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load staff intake");
  }
}

export async function PATCH(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const body = await request.json().catch(() => ({}));
    await updateStaffIntakeAssignment({
      context,
      assignmentId: String(body?.assignmentId || body?.assignment_id || "").trim(),
      action: body?.action,
      note: body?.note || null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to update staff intake");
  }
}
