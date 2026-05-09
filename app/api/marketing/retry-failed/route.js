import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {

  try {

    console.log(
      "RETRY FAILED START"
    );

    return NextResponse.json({
      success: true,
      message:
        "Retry system online",
    });

  } catch (retryError) {

    console.error(
      "RETRY FAILED ERROR:",
      retryError
    );

    return NextResponse.json(
      {
        success: false,
        error:
          retryError.message,
      },
      { status: 500 }
    );

  }

}