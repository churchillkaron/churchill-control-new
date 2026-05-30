import { NextResponse } from "next/server";

import { validateStateTransition } from "@/lib/orchestration/validateStateTransition";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const valid =
      await validateStateTransition({
        entityType:
          body.entityType,
        currentState:
          body.currentState,
        nextState:
          body.nextState,
      });

    return NextResponse.json({
      success: true,
      valid,
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
