import { NextResponse } from "next/server";
import broadcastEvent from "@/lib/realtime/broadcastEvent";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await broadcastEvent(body);

    return NextResponse.json(result);
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
