import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth/requireAuth";

export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        error: error.message,
      },
      {
        status: 401,
      }
    );
  }
}
