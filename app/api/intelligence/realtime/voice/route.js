import { NextResponse } from "next/server";

import buildRealtimeVoiceSession from "@/lib/intelligence/realtime/voice/buildRealtimeVoiceSession";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildRealtimeVoiceSession(
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
