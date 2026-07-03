export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import toggleLegalEntity from "@/lib/finance/legal-entities/capabilities/toggleLegalEntity";

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
      await toggleLegalEntity({
        organization_id: access.organizationId,
        entity_id: body.entity_id,
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
