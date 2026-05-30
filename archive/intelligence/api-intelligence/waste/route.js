import { NextResponse } from "next/server";

import buildFoodWasteReductionAI from "@/lib/intelligence/waste/buildFoodWasteReductionAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildFoodWasteReductionAI(
        body
      );

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
