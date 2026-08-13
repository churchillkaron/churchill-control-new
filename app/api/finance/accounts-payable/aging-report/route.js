export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { buildAccountsPayableAging } from "@/lib/finance/reporting/reports/accountsPayableAging";

function statusFor(error) {
  const message = String(error?.message || "");
  if (message.toLowerCase().includes("permission denied")) return 403;
  return error?.status || 500;
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
      permissionKey: "finance.payables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data, error } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", access.organizationId);

    if (error) throw error;

    const report = buildAccountsPayableAging({
      payables: data || [],
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Accounts payable aging load failed",
      },
      { status: statusFor(error) }
    );
  }
}
