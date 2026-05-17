import { NextResponse } from "next/server";
import registerCron from "@/lib/cron/registerCron";

export async function POST() {
  try {
    const result = await registerCron();

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
