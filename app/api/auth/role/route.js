import { NextResponse } from "next/server";
import { requireRole } from "@/lib/shared/auth/requireRole";

export async function POST(req) {
  try {
    const body = await req.json();

    const user =
      await requireRole(body);

    return NextResponse.json({
      allowed: true,
      user,
    });
  } catch (error) {
    return NextResponse.json(
      {
        allowed: false,
        error: error.message,
      },
      {
        status: 403,
      }
    );
  }
}
