import { NextResponse } from "next/server";
import requireAuth from "@/lib/auth/requireAuth";

export async function GET() {
  try {
    const session = await requireAuth();

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
