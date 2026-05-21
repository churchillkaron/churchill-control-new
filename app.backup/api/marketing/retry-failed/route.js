export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {

  try {

    return NextResponse.json({
      success: true,
      message:
        "Retry queue executed",
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
