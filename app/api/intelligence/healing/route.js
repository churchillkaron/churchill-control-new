import { NextResponse } from "next/server";

import buildSelfHealingInfrastructure from "@/lib/intelligence/healing/buildSelfHealingInfrastructure";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildSelfHealingInfrastructure(
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
