export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { createStaffPasskeyEnrollmentAuthorization } from "@/lib/people/workforce/StaffPasskeyBrokerRuntime";
import { requestPlatformHostname } from "@/lib/platform/context/resolvePlatformHostContext";
import { resolveRegisteredPlatformHostContext } from "@/lib/platform/context/resolveRegisteredPlatformHostContext";

export async function POST(request) {
  try {
    const hostname = requestPlatformHostname(request);
    const hostContext = await resolveRegisteredPlatformHostContext(hostname);
    if (!hostContext?.organizationId) {
      return NextResponse.json({ success:false, error:"Passkey enrollment must start from a registered customer domain" }, { status:400 });
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: hostContext.organizationId,
      allowIncompleteActivation: true,
    });
    if (!context.success) {
      return NextResponse.json({ success:false, error:context.error, code:context.code || null }, { status:context.status || 403 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await createStaffPasskeyEnrollmentAuthorization({
      request,
      organizationId: context.organizationId,
      staff: context.staff,
      user: context.user,
      returnPath: body?.returnPath || "/staff",
    });
    const response = NextResponse.json({ success:true, ...result }, { status:201 });
    response.headers.set("Cache-Control","private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to start passkey enrollment" }, { status:Number(error?.status) || 400 });
  }
}
