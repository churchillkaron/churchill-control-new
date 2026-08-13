export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { listFixedAssetsCommand } from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
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

    const result = await listFixedAssetsCommand({
      organization_id: access.organizationId,
    });

    const assets = (result.assets || []).map((asset) => ({
      ...asset,
      calculated_book_value: Math.max(
        0,
        Number(asset.purchase_cost || 0) -
          Number(asset.accumulated_depreciation || 0)
      ),
    }));

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      assets,
    });
  } catch (error) {
    const message = error.message || "Fixed asset load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
