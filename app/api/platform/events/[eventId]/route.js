import { NextResponse } from "next/server";
import { EventRegistry } from "@/lib/event-registry";

export async function GET(
  request,
  { params }
) {
  const event =
    EventRegistry.get(
      params.eventId
    );

  if (!event) {
    return NextResponse.json(
      {
        success: false,
        error: "EVENT_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    event,
  });
}
