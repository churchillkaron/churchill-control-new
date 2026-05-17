import { NextResponse } from "next/server";

import runExecutiveAutomation from "@/lib/intelligence/execution/runExecutiveAutomation";

export async function POST() {

  try {

    const result =
      await runExecutiveAutomation();

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
