import { NextResponse } from "next/server";

import { runMenuEngineering } from "@/lib/production/costing/capabilities/runMenuEngineering";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runMenuEngineering({
        tenantId:
          body.tenantId,
        recipeId:
          body.recipeId,
        popularityScore:
          body.popularityScore,
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
