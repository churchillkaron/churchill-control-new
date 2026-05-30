import { NextResponse } from "next/server";

import { postAPSubledger } from "@/lib/finance/core/postAPSubledger";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await postAPSubledger(body);

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
