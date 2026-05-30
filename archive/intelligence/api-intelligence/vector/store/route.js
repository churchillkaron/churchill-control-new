import { NextResponse } from "next/server";

import storePgVectorMemory from "@/lib/intelligence/vector/storePgVectorMemory";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await storePgVectorMemory(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
