import { NextResponse } from "next/server";

import runWorkflowEngine from "@/lib/intelligence/automation/runAutomationEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runWorkflowEngine(
        body
      );

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
