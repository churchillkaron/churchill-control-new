import { NextResponse } from "next/server";
import { createVendor } from "@/lib/finance/createVendor";

export async function POST(request) {
  try {
    const body = await request.json();

    const vendor = await createVendor(body);

    return NextResponse.json({
      success: true,
      vendor,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}
