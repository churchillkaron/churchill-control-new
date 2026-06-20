import { NextResponse } from "next/server";
import updateKitchenOrderStatus from "@/lib/operations/work-centers/updateWorkCenterItemStatus";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await updateWorkCenterItemStatus(
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
