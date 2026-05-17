import { NextResponse } from "next/server";

import publishEvent from "@/lib/events/publishEvent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await publishEvent(body);

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
