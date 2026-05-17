import { NextResponse } from "next/server";

import buildAutonomousAccountingClose from "@/lib/intelligence/finance/close/buildAutonomousAccountingClose";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousAccountingClose(
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
