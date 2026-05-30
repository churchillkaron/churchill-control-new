import { NextResponse } from "next/server";

import { createUnlockRequest } from "@/lib/finance/core/createUnlockRequest";

export async function POST(request) {
  try {
    const body = await request.json();

    const unlockRequest =
      await createUnlockRequest(body);

    return NextResponse.json({
      success: true,
      unlockRequest,
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
