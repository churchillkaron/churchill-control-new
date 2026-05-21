import { NextResponse } from "next/server";
import requireRole from "@/lib/auth/requireRole";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await requireRole(body);

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
