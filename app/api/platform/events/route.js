import { NextResponse } from "next/server";
import { EventRegistry } from "@/lib/event-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    events: EventRegistry.all(),
  });
}
