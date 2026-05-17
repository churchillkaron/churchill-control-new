import { NextResponse } from "next/server";

import getEvents from "@/lib/intelligence/events/getEvents";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await getEvents(
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
