import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { runMenuEngineering } from "@/lib/inventory/production/costing/capabilities/runMenuEngineering";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request: request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const result =
      await runMenuEngineering({
        organizationId:
          access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        recipeId:
          body.recipeId ||
          body.recipe_id,
        popularityScore:
          body.popularityScore ||
          body.popularity_score,
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
