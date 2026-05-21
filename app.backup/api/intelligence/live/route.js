import { NextResponse } from "next/server";

import buildLiveCommandCenter from "@/lib/intelligence/live/buildLiveCommandCenter";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildLiveCommandCenter(
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
