import { NextResponse } from "next/server";

import { calculateRecipeCost } from "@/lib/inventory/costing/calculateRecipeCost";

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
        itemId:
          body.itemId,
        ingredients:
          body.ingredients,
        portions:
          body.portions,
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
