export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { upsertTaxCodeCommand } from "@/lib/finance/tax-codes/runtime/TaxCodeApplicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id || body.organizationId,
      request: req,
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
      permissionKey: "finance.tax.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await upsertTaxCodeCommand({
      organization_id: access.organizationId,
      values: {
        ...body,
        organization_id: access.organizationId,
      },
    });

    return NextResponse.json({ success: true, taxCode: result });
  } catch (error) {
    const message = error.message || "Tax code upsert failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
