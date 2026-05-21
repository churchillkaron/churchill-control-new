export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {

  try {

    return NextResponse.json({
      success: true,
      message:
        "Queue runner online",
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
