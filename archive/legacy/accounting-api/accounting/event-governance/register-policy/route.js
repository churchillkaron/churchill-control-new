import { NextResponse } from "next/server";

import { registerEventPolicy } from "@/lib/finance/core/registerEventPolicy";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const policy =
      await registerEventPolicy(
        body
      );

    return NextResponse.json({
      success: true,
      policy,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
