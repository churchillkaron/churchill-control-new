import { NextResponse } from "next/server";
import createHealthSnapshot from "@/lib/monitoring/createHealthSnapshot";

export async function GET() {
  try {
    const result = await createHealthSnapshot();

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
