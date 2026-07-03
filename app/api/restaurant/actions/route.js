import { NextResponse } from "next/server";
import { executeRestaurantAction } from "@/lib/restaurant/runtime/RestaurantActionEngine";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await executeRestaurantAction({
      action: body.action,
      context: body.context || {},
      payload: body.payload || {},
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("RESTAURANT_ACTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "restaurant_action_failed",
      },
      { status: 500 }
    );
  }
}
