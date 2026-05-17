import { NextResponse } from "next/server";

import buildRestaurantDigitalTwin from "@/lib/intelligence/simulation/buildRestaurantDigitalTwin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildRestaurantDigitalTwin(
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
