import { NextResponse } from "next/server";
import processAiTasks from "@/lib/workers/processAiTasks";

export async function POST() {
  try {
    const result = await processAiTasks();

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
