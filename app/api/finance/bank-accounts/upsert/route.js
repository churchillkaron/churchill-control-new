export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { upsertBankAccountCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|invalid|not found/i.test(normalized) ? 400 : 500;
}

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
      permissionKey: "finance.banking.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await upsertBankAccountCommand({
      ...body,
      organization_id: access.organizationId,
      organizationId: access.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Bank account update failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
