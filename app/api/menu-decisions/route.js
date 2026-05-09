import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {

  try {

    console.log(
      "MENU DECISIONS START"
    );

    const decisionResult = {
      success: true,
      message:
        "Menu decisions system online",
      recommendations: [],
    };

    return NextResponse.json(
      decisionResult
    );

  } catch (menuError) {

    console.error(
      "MENU DECISION ERROR:",
      menuError
    );

    return NextResponse.json(
      {
        success: false,
        error:
          menuError.message ||
          "Menu decisions failed",
      },
      { status: 500 }
    );

  }

}