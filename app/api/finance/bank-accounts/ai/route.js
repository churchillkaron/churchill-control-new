export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { analyzeBankAccountsCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id || body.organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await analyzeBankAccountsCommand({
      organization_id: access.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Bank account analysis failed";
    const status = String(message).toLowerCase().includes("permission denied") ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
