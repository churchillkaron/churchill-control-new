export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import toggleCostCenter from "@/lib/finance/cost-centers/capabilities/toggleCostCenter";

export async function POST(req) {
  try {
    await requireAuth();

    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
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

    const result =
      await toggleCostCenter({
        organization_id: access.organizationId,
        cost_center_id: body.cost_center_id,
        updated_by: body.userId || "system",
      });

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
