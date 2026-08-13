export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { getGeneralLedger } from "@/lib/finance/getGeneralLedger";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");

    if (!requestedOrganizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
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

    const rows = await getGeneralLedger({
      organizationId: access.organizationId,
      entityId,
      accountId: searchParams.get("accountId") || searchParams.get("account_id") || null,
      startDate: searchParams.get("startDate") || searchParams.get("start_date") || null,
      endDate: searchParams.get("endDate") || searchParams.get("end_date") || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      count: rows.length,
      rows,
      entries: rows,
    });
  } catch (error) {
    console.error("general-ledger GET", error);
    const message = error.message || "General Ledger load failed";
    return NextResponse.json(
      {
        success: false,
        error: message,
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
      },
      { status: statusFor(message) }
    );
  }
}
