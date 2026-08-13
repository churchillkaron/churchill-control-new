export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { calculateDepreciationCommand } from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organization_id") ||
        searchParams.get("organizationId"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await calculateDepreciationCommand({
      organization_id: access.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Depreciation calculation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
