import { NextResponse } from "next/server";

import { runStateTransition } from "@/lib/orchestration/runStateTransition";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const transition =
      await runStateTransition({
        tenantId:
          body.tenantId,
        entityType:
          body.entityType,
        entityId:
          body.entityId,
        currentState:
          body.currentState,
        nextState:
          body.nextState,
        transitionAction:
          body.transitionAction,
        transitionedBy:
          body.transitionedBy,
      });

    return NextResponse.json({
      success: true,
      transition,
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
