import { NextResponse } from "next/server";

import { calculateRecipeCost } from "@/lib/inventory/production/recipes/capabilities/calculateRecipeCost";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await calculateRecipeCost({
        organizationId:
          body.organizationId ||
          body.organization_id,
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
