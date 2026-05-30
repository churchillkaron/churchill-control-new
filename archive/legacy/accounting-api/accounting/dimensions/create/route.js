import { NextResponse } from "next/server";

import { createDimension } from "@/lib/finance/core/createDimension";

export async function POST(request) {
  try {
    const body = await request.json();

    const dimension = await createDimension(body);

    return NextResponse.json({
      success: true,
      dimension,
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
