import { NextResponse } from "next/server";
import createTenant from "@/lib/onboarding/createTenant";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await createTenant(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
