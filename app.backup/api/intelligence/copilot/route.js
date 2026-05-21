import { NextResponse } from "next/server";

import buildOwnerCopilot from "@/lib/intelligence/copilot/buildOwnerCopilot";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildOwnerCopilot(
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
