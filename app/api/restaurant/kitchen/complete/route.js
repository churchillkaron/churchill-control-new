import { NextResponse } from "next/server";

import {
  execute,
} from "@/lib/restaurant/kitchen/workflows/CompleteKitchenTicket";

export async function POST(req) {
  try {
    const body = await req.json();

    const result =
      await execute({
        context: {
          organizationId:
            body.organizationId,
        },
        payload: {
          ticketId:
            body.ticketId,
        },
      });

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {

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
