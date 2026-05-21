import { NextResponse } from "next/server";

import runCorrectiveAction from "@/lib/intelligence/actions/runCorrectiveAction";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runCorrectiveAction(
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
