import { NextResponse } from "next/server";

import { postInventorySubledger } from "@/lib/finance/core/postInventorySubledger";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await postInventorySubledger(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
