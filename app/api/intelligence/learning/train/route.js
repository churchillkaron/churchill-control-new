import { NextResponse } from "next/server";

import trainBusinessProfile from "@/lib/intelligence/learning/trainBusinessProfile";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await trainBusinessProfile(
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
