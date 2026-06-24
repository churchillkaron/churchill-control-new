import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  getGeneralLedger,
} from "@/lib/finance/getGeneralLedger";

export async function GET(request) {

  const { searchParams } =
    new URL(request.url);

  const access =
    await requireOrganizationAccess({
      organizationId:
        searchParams.get(
          "organizationId"
        ),
    });

  if (!access.success) {
    return NextResponse.json(
      {
        success: false,
        error: access.error,
      },
      {
        status: access.status,
      }
    );
  }

  const data =
    await getGeneralLedger({
      tenantId:
        access.tenantId,
    });

  return NextResponse.json({
    success: true,
    tenantId:
      access.tenantId,
    rows: data,
  });

}
