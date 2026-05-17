import { NextResponse } from "next/server";
import checkQueueHealth from "@/lib/health/checkQueueHealth";

export async function GET() {
  try {
    const health = await checkQueueHealth();

    return NextResponse.json(health, {
      status: health.status === "healthy" ? 200 : 503,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
