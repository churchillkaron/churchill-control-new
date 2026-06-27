import { NextResponse } from "next/server";

import { calculateRecipeCost } from "@/lib/production/recipes/capabilities/calculateRecipeCost";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await calculateRecipeCost({
        tenantId:
          body.tenantId,
        recipeId:
          body.recipeId,
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
