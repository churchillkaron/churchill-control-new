import { NextResponse } from "next/server";

import runRealtimeAIStream from "@/lib/intelligence/stream/runRealtimeAIStream";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runRealtimeAIStream(
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
