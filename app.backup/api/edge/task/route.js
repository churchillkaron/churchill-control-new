import { NextResponse } from "next/server";

import createEdgeTask from "@/lib/edge/createEdgeTask";

export const runtime = "edge";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createEdgeTask(body);

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
