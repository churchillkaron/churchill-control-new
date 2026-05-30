import { NextResponse } from "next/server";

import { postARSubledger } from "@/lib/finance/core/postARSubledger";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await postARSubledger(body);

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
