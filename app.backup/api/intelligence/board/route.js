import { NextResponse } from "next/server";

import buildAIBoardAdvisor from "@/lib/intelligence/board/buildAIBoardAdvisor";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAIBoardAdvisor(
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
