import { NextResponse } from "next/server";
import runWorker from "@/lib/workers/runWorker";

export async function POST() {
  try {
    const result = await runWorker();

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
