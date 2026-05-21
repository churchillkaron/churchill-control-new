import { NextResponse } from "next/server";

import requireManager from "@/lib/auth/guards/requireManager";

export async function GET() {

  try {

    const auth =
      await requireManager();

    return NextResponse.json(
      auth
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
