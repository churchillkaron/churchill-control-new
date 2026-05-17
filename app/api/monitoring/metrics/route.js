import { NextResponse } from "next/server";
import createSystemMetrics from "@/lib/monitoring/createSystemMetrics";

export async function GET() {
  try {
    const metrics = await createSystemMetrics();

    return NextResponse.json(metrics);
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
