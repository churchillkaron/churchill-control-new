import { NextResponse } from "next/server";
import checkDatabaseHealth from "@/lib/health/checkDatabaseHealth";

export async function GET() {
  try {
    const health = await checkDatabaseHealth();

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
