import { NextResponse } from "next/server";
import { postRestaurantSale } from "@/lib/finance/integrations/postRestaurantSale";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await postRestaurantSale(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
