export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import settleIntercompanyTransaction from "@/lib/finance/intercompany/capabilities/settleIntercompanyTransaction";

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
      await settleIntercompanyTransaction({
        organization_id: access.organizationId,
        transaction_id: body.transaction_id,
        settled_by: body.userId || "system",
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
