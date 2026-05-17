import { NextResponse } from "next/server";

import buildVoiceResponse from "@/lib/intelligence/voice/buildVoiceResponse";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildVoiceResponse(
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
