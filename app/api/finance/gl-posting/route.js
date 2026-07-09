export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { postVendorPaymentGLCommand } from "@/lib/finance/general-ledger/runtime/GeneralLedgerApplicationService";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await postVendorPaymentGLCommand({
      ...body,
      organizationId: access.organizationId,
    });

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
