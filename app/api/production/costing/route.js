import { NextResponse } from "next/server";

import calculateDishCost from "@/lib/production/costing/calculateDishCost";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await calculateDishCost({

        dish_id:
          body.dish_id,
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
