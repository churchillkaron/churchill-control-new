export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listAccountsCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    const access =
      await requireOrganizationAccess({
        organizationId,
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

    const accounts =
      await listAccountsCommand({
        organizationId:
          access.organizationId,
        entityId,
      });

    return NextResponse.json({
      success: true,
      accounts,
      rows: accounts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Chart of accounts load failed",
      },
      {
        status: 500,
      }
    );
  }
}
