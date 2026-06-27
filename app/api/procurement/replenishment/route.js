import { NextResponse } from "next/server";

import generatePurchaseRecommendation from "@/lib/procurement/recommendations/capabilities/generatePurchaseRecommendation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await generatePurchaseRecommendation({

        ingredient_id:
          body.ingredient_id,

        days:
          body.days || 7,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
