import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { calculateRecipeCost } from "@/lib/inventory/production/recipes/capabilities/calculateRecipeCost";

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
      await calculateRecipeCost({
        organizationId:
          access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        recipeId:
          body.recipeId ||
          body.recipe_id,
        laborCost:
          body.laborCost,
        overheadCost:
          body.overheadCost,
        sellingPrice:
          body.sellingPrice,
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
