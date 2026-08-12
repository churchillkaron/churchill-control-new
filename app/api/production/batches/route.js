import { NextResponse } from "next/server";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  listProductionBatches,
} from "@/lib/inventory/production/batches/listProductionBatches";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        },
      );
    }

    const batches = await listProductionBatches({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      batches,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }
}
