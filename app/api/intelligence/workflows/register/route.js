import { NextResponse } from "next/server";

import registerWorkflow from "@/lib/intelligence/workflows/registerWorkflow";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await registerWorkflow(
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
