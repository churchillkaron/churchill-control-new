import { NextResponse } from "next/server";

import getInsightMemory from "@/lib/intelligence/memory/getInsightMemory";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await getInsightMemory(
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
