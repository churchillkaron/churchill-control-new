export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import createSnapshot from "@/lib/analytics/createSnapshot";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await createSnapshot(body);

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
