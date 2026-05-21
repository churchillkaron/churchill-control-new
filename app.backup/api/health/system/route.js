import { NextResponse } from "next/server";
import checkSystemHealth from "@/lib/health/checkSystemHealth";

export async function GET() {
  try {
    const health = await checkSystemHealth();

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
