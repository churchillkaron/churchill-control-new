import { NextResponse } from "next/server";

import {
  executeRestaurantCapability,
} from "@/lib/restaurant/runtime/loaders/RestaurantCapabilityLoader";

export async function POST(req) {

  const body =
    await req.json();

  const result =
    await executeRestaurantCapability({

      boundedContext:
        body.boundedContext,

      capability:
        body.capability,

      context:
        body.context,

      payload:
        body.payload,

    });

  return NextResponse.json({
    success: true,
    result,
  });

}
