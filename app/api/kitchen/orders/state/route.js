import { NextResponse } from "next/server";
import updateKitchenOrderStatus from "@/lib/pos/kitchen/updateKitchenOrderStatus";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await updateKitchenOrderStatus(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );

  }
}
