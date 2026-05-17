import { NextResponse } from "next/server";

import searchPgVectorMemory from "@/lib/intelligence/vector/searchPgVectorMemory";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await searchPgVectorMemory(
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
