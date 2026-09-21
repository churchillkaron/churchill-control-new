export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffPhoneVerification, requestStaffPhoneVerification, verifyStaffPhoneCode } from "@/lib/people/workforce/StaffPhoneVerificationRuntime";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

async function contextFor(request) {
  return resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
}

export async function GET(request) {
  try {
    const context = await contextFor(request);
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const phone = await loadStaffPhoneVerification({ organizationId: context.organizationId, staff: context.staff });
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load phone verification");
  }
}

export async function POST(request) {
  try {
    const context = await contextFor(request);
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const body = await request.json().catch(() => ({}));
    const result = await requestStaffPhoneVerification({ organizationId: context.organizationId, staff: context.staff, phone: body.phone });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to send phone verification code");
  }
}

export async function PATCH(request) {
  try {
    const context = await contextFor(request);
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const body = await request.json().catch(() => ({}));
    const phone = await verifyStaffPhoneCode({ organizationId: context.organizationId, staff: context.staff, code: body.code, phone: body.phone });
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to verify phone");
  }
}
