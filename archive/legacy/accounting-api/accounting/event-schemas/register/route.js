import { NextResponse } from "next/server";

import { registerEventSchema } from "@/lib/finance/core/registerEventSchema";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const schema =
      await registerEventSchema(
        body
      );

    return NextResponse.json({
      success: true,
      schema,
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
