import { NextResponse } from "next/server";

import rateLimit from "@/lib/security/rateLimit";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      rateLimit(body);

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        allowed: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
