import { NextResponse } from "next/server";
import { RestaurantRuntime } from "@/lib/restaurant/RestaurantRuntime";

export async function POST(req) {
  try {
    const body = await req.json();

    const boundedContext = body.boundedContext;
    const capability = body.capability;

    const loader =
      RestaurantRuntime.capabilities?.[boundedContext]?.[capability];

    if (!loader) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown restaurant capability: ${boundedContext}.${capability}`,
        },
        { status: 404 }
      );
    }

    const module = await loader();

    const result = await module.execute({
      context: body.context || {},
      payload: body.payload || {},
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[RESTAURANT_EXECUTE]", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
