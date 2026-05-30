import { NextResponse } from "next/server";

import { replayDeadLetterQueue } from "@/lib/orchestration/replayDeadLetterQueue";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const replayed =
      await replayDeadLetterQueue({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      replayed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
